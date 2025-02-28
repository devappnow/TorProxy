const { spawn } = require('child_process');
const TorControl = require('tor-control-promise');
const path = require('path');
const fs = require('fs');
const os = require('os');

class TorProxy {
    constructor(options = {}) {
        this.torProcess = null;
        this.controller = null;
        this.id = options.id || Date.now();
        this.socksPort = options.socksPort || 9050;
        this.controlPort = options.controlPort || 9051;
        this.dataDir = options.dataDir || path.join(os.tmpdir(), `tor-${this.id}`);
        this.torPath = options.torPath || this._findTorExecutable();
    }

    _findTorExecutable() {
        // Danh sách các vị trí có thể chứa tor.exe
        const possibleLocations = [
            path.join(__dirname, 'tor.exe'),                   // Cùng thư mục với mã nguồn
            path.join(__dirname, 'bin', 'tor.exe'),           // Thư mục bin
            path.join(process.cwd(), 'tor.exe'),              // Thư mục hiện tại
            path.join(process.cwd(), 'bin', 'tor.exe'),       // Thư mục bin trong dự án
            path.join(process.cwd(), 'node_modules', 'tor_proxy', 'tor.exe'), // Trong node_modules
            path.join(process.cwd(), 'node_modules', 'tor_proxy', 'bin', 'tor.exe') // Thư mục bin trong node_modules
        ];
        
        // Kiểm tra từng vị trí
        for (const location of possibleLocations) {
            if (fs.existsSync(location)) {
                console.log(`Tìm thấy tor.exe tại: ${location}`);
                return location;
            }
        }
        
        // Kiểm tra trong các thư mục PATH
        if (process.env.PATH) {
            const pathDirs = process.env.PATH.split(path.delimiter);
            for (const dir of pathDirs) {
                const location = path.join(dir, 'tor.exe');
                if (fs.existsSync(location)) {
                    console.log(`Tìm thấy tor.exe trong PATH tại: ${location}`);
                    return location;
                }
            }
        }
        
        // Nếu không tìm thấy, trả về mặc định và để xử lý lỗi sau
        console.error(`
==========================================================
CẢNH BÁO: Không tìm thấy tor.exe trong bất kỳ vị trí nào.
Vui lòng đảm bảo tor.exe được đặt ở một trong các vị trí sau:
- Thư mục gốc của dự án
- Thư mục 'bin' trong dự án
- Đường dẫn đã chỉ định qua options.torPath
==========================================================
        `);
        return 'tor.exe'; // Sẽ tạo lỗi nếu không tìm thấy trong PATH
    }

    async start(timeout = 120000) {
        try {
            // Tạo thư mục data riêng cho mỗi instance
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }

            // Đảm bảo tor.exe tồn tại
            if (!fs.existsSync(this.torPath)) {
                throw new Error(`Không tìm thấy tor.exe tại: ${this.torPath}`);
            }
            
            this.torProcess = spawn(this.torPath, [
                '--SocksPort', this.socksPort,
                '--ControlPort', this.controlPort,
                '--HashedControlPassword', '',
                '--DataDirectory', this.dataDir,
                '--NewCircuitPeriod', '10',
                '--MaxCircuitDirtiness', '10',
                '--CircuitBuildTimeout', '5',
                '--LearnCircuitBuildTimeout', '0'
            ]);

            this.torProcess.on('error', (error) => {
                throw error;
            });

            // Đợi cho Tor khởi động hoàn tất trước khi thiết lập controller
            let bootstrapComplete = false;
            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Timeout khi khởi động Tor (${timeout}ms)`));
                }, timeout);

                this.torProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    console.log(`Tor ${this.id} stdout:`, output);
                    if (output.includes('Bootstrapped 100%')) {
                        bootstrapComplete = true;
                        clearTimeout(timeout);
                        resolve();
                    }
                });

                this.torProcess.stderr.on('data', (data) => {
                    const output = data.toString();
                    console.error(`Tor ${this.id} stderr:`, output);
                    // Kiểm tra các thông báo lỗi quan trọng
                    if (output.includes('Address already in use') || 
                        output.includes('Permission denied')) {
                        clearTimeout(timeout);
                        reject(new Error(`Lỗi Tor: ${output}`));
                    }
                });

                this.torProcess.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });

                this.torProcess.on('exit', (code) => {
                    if (code !== 0 && !bootstrapComplete) {
                        clearTimeout(timeout);
                        reject(new Error(`Tor process exited with code ${code}`));
                    }
                });
            });

            // Đợi thêm 2 giây sau khi bootstrap hoàn thành để đảm bảo mọi thứ đã sẵn sàng
            await new Promise(resolve => setTimeout(resolve, 2000));
            
            try {
                // Khởi tạo controller
                this.controller = new TorControl({
                    password: '',
                    port: this.controlPort
                });
                
                // Kết nối đến controller
                await this.controller.connect();
            } catch (controllerError) {
                console.error(`Lỗi khi kết nối controller cho Tor ${this.id}:`, controllerError);
                // Không throw lỗi ở đây, chỉ ghi log và tiếp tục nếu proxy đã khởi động thành công
            }
            
            return {
                id: this.id,
                socksHost: '127.0.0.1',
                socksPort: this.socksPort,
                controlPort: this.controlPort
            };
        } catch (error) {
            await this.cleanup();
            console.error(`Lỗi khi khởi động Tor ${this.id}:`, error);
            throw error;
        }
    }

    async getNewIdentity() {
        try {
            if (this.controller) {
                try {
                    await this.controller.signal('NEWNYM');
                    return true;
                } catch (error) {
                    console.error(`Lỗi khi thay đổi identity cho Tor ${this.id}:`, error);
                    
                    // Thử kết nối lại controller nếu bị mất kết nối
                    try {
                        await this.controller.connect();
                        await this.controller.signal('NEWNYM');
                        return true;
                    } catch (reconnectError) {
                        console.error(`Không thể kết nối lại controller cho Tor ${this.id}:`, reconnectError);
                        return false;
                    }
                }
            }
            return false;
        } catch (error) {
            console.error(`Lỗi khi thay đổi identity cho Tor ${this.id}:`, error);
            return false;
        }
    }

    async cleanup() {
        try {
            if (this.controller) {
                try {
                    await this.controller.quit();
                } catch (error) {
                    console.error(`Lỗi khi đóng controller cho Tor ${this.id}:`, error);
                    // Không throw lỗi ở đây, tiếp tục quá trình dọn dẹp
                }
                this.controller = null;
            }
            if (this.torProcess) {
                try {
                    // Gửi SIGTERM trước
                    this.torProcess.kill('SIGTERM');
                    
                    // Đợi 1 giây rồi gửi SIGKILL nếu cần
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    if (this.torProcess) {
                        this.torProcess.kill('SIGKILL');
                    }
                } catch (killError) {
                    console.error(`Lỗi khi chấm dứt quy trình Tor ${this.id}:`, killError);
                }
                this.torProcess = null;
            }
            // Xóa thư mục data
            if (fs.existsSync(this.dataDir)) {
                try {
                    fs.rmSync(this.dataDir, { recursive: true, force: true });
                } catch (fsError) {
                    console.error(`Lỗi khi xóa thư mục dữ liệu Tor ${this.id}:`, fsError);
                }
            }
        } catch (error) {
            console.error(`Lỗi khi cleanup Tor ${this.id}:`, error);
        }
    }

    async stop() {
        const wasRunning = this.torProcess !== null;
        await this.cleanup();
        return wasRunning;
    }
}

class TorProxyPool {
    constructor(size = 5, startPort = 9050) {
        this.proxies = new Map();
        this.size = size;
        this.startPort = startPort;
    }

    async initialize() {
        try {
            for (let i = 0; i < this.size; i++) {
                const proxy = new TorProxy({
                    id: i + 1,
                    socksPort: this.startPort + (i * 2),
                    controlPort: this.startPort + 1 + (i * 2)
                });
                this.proxies.set(i + 1, proxy);
                await proxy.start();
            }
        } catch (error) {
            await this.cleanup();
            throw error;
        }
    }

    getProxy(id) {
        return this.proxies.get(id);
    }

    async rotateIdentities() {
        const promises = Array.from(this.proxies.values()).map(proxy => 
            proxy.getNewIdentity()
        );
        return Promise.all(promises);
    }

    async cleanup() {
        const promises = Array.from(this.proxies.values()).map(proxy => 
            proxy.stop()
        );
        await Promise.all(promises);
        this.proxies.clear();
    }
}

module.exports = { TorProxy, TorProxyPool }; 