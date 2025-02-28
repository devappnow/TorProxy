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
    }

    async start() {
        try {
            // Tạo thư mục data riêng cho mỗi instance
            if (!fs.existsSync(this.dataDir)) {
                fs.mkdirSync(this.dataDir, { recursive: true });
            }

            const torPath = path.join(__dirname, 'tor.exe');
            
            this.torProcess = spawn(torPath, [
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

            this.controller = new TorControl({
                password: '',
                port: this.controlPort
            });

            await new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error('Timeout khi khởi động Tor'));
                }, 45000);

                this.torProcess.stdout.on('data', (data) => {
                    const output = data.toString();
                    if (output.includes('Bootstrapped 100%')) {
                        clearTimeout(timeout);
                        resolve();
                    }
                });

                this.torProcess.stderr.on('data', (data) => {
                    console.error(`Tor ${this.id} stderr:`, data.toString());
                });

                this.torProcess.on('error', (err) => {
                    clearTimeout(timeout);
                    reject(err);
                });

                this.torProcess.on('exit', (code) => {
                    if (code !== 0) {
                        clearTimeout(timeout);
                        reject(new Error(`Tor process exited with code ${code}`));
                    }
                });
            });

            await this.controller.connect();
            
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
                await this.controller.signal('NEWNYM');
                return true;
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
                }
                this.controller = null;
            }
            if (this.torProcess) {
                this.torProcess.kill();
                this.torProcess = null;
            }
            // Xóa thư mục data
            if (fs.existsSync(this.dataDir)) {
                fs.rmSync(this.dataDir, { recursive: true, force: true });
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