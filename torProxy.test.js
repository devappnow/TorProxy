const { TorProxy, TorProxyPool } = require('./torProxy');
const path = require('path');
const fs = require('fs');

describe('TorProxy', () => {
    let torProxy;
    
    beforeEach(() => {
        torProxy = new TorProxy({
            id: 'test',
            socksPort: 9060,
            controlPort: 9061
        });
    });

    afterEach(async () => {
        await torProxy.stop();
    });

    describe('Constructor', () => {
        test('khởi tạo với các giá trị mặc định', () => {
            const defaultProxy = new TorProxy();
            expect(defaultProxy.torProcess).toBeNull();
            expect(defaultProxy.controller).toBeNull();
            expect(defaultProxy.socksPort).toBe(9050);
            expect(defaultProxy.controlPort).toBe(9051);
        });

        test('khởi tạo với options tùy chỉnh', () => {
            expect(torProxy.torProcess).toBeNull();
            expect(torProxy.controller).toBeNull();
            expect(torProxy.id).toBe('test');
            expect(torProxy.socksPort).toBe(9060);
            expect(torProxy.controlPort).toBe(9061);
        });
    });

    describe('start()', () => {
        test('kiểm tra file tor.exe tồn tại', () => {
            const torPath = path.join(__dirname, 'tor.exe');
            if (fs.existsSync(torPath)) {
                expect(fs.existsSync(torPath)).toBe(true);
            } else {
                console.warn('Warning: tor.exe không tồn tại, bỏ qua test này');
            }
        });

        test('khởi động tor thành công và trả về thông tin proxy', async () => {
            const torPath = path.join(__dirname, 'tor.exe');
            if (!fs.existsSync(torPath)) {
                console.warn('Warning: tor.exe không tồn tại, bỏ qua test này');
                return;
            }

            const proxyInfo = await torProxy.start();
            expect(proxyInfo).toEqual({
                id: 'test',
                socksHost: '127.0.0.1',
                socksPort: 9060,
                controlPort: 9061
            });
        }, 60000);

        test('ném lỗi khi không tìm thấy tor.exe', async () => {
            const torPath = path.join(__dirname, 'tor.exe');
            if (!fs.existsSync(torPath)) {
                await expect(torProxy.start()).rejects.toThrow();
            } else {
                console.warn('Warning: tor.exe tồn tại, bỏ qua test này');
            }
        }, 60000);
    });

    describe('getNewIdentity()', () => {
        test('đổi identity thành công khi tor đang chạy', async () => {
            const torPath = path.join(__dirname, 'tor.exe');
            if (!fs.existsSync(torPath)) {
                console.warn('Warning: tor.exe không tồn tại, bỏ qua test này');
                return;
            }

            await torProxy.start();
            const result = await torProxy.getNewIdentity();
            expect(result).toBe(true);
        }, 60000);

        test('trả về false khi tor chưa được khởi động', async () => {
            const result = await torProxy.getNewIdentity();
            expect(result).toBe(false);
        });
    });

    describe('stop()', () => {
        test('dừng tor thành công', async () => {
            const torPath = path.join(__dirname, 'tor.exe');
            if (!fs.existsSync(torPath)) {
                console.warn('Warning: tor.exe không tồn tại, bỏ qua test này');
                return;
            }

            await torProxy.start();
            const wasRunning = await torProxy.stop();
            
            expect(wasRunning).toBe(true);
            expect(torProxy.torProcess).toBeNull();
            expect(torProxy.controller).toBeNull();
            
            // Kiểm tra thư mục data đã được xóa
            expect(fs.existsSync(torProxy.dataDir)).toBe(false);
        }, 60000);

        test('xử lý an toàn khi tor chưa được khởi động', async () => {
            const wasRunning = await torProxy.stop();
            expect(wasRunning).toBe(false);
        });
    });
});

describe('TorProxyPool', () => {
    let pool;

    beforeEach(() => {
        pool = new TorProxyPool(2, 9070); // Sử dụng 2 proxy để test nhanh hơn
    });

    afterEach(async () => {
        await pool.cleanup();
    });

    test('khởi tạo pool với các giá trị mặc định', () => {
        const defaultPool = new TorProxyPool();
        expect(defaultPool.size).toBe(5);
        expect(defaultPool.startPort).toBe(9050);
        expect(defaultPool.proxies.size).toBe(0);
    });

    test('khởi tạo pool với options tùy chỉnh', () => {
        expect(pool.size).toBe(2);
        expect(pool.startPort).toBe(9070);
        expect(pool.proxies.size).toBe(0);
    });

    test('initialize tạo đúng số lượng proxy', async () => {
        const torPath = path.join(__dirname, 'tor.exe');
        if (!fs.existsSync(torPath)) {
            console.warn('Warning: tor.exe không tồn tại, bỏ qua test này');
            return;
        }

        await pool.initialize();
        expect(pool.proxies.size).toBe(2);
        
        const proxy1 = pool.getProxy(1);
        const proxy2 = pool.getProxy(2);
        
        expect(proxy1.socksPort).toBe(9070);
        expect(proxy1.controlPort).toBe(9071);
        expect(proxy2.socksPort).toBe(9072);
        expect(proxy2.controlPort).toBe(9073);
    }, 120000);

    test('rotateIdentities thay đổi identity cho tất cả các proxy', async () => {
        const torPath = path.join(__dirname, 'tor.exe');
        if (!fs.existsSync(torPath)) {
            console.warn('Warning: tor.exe không tồn tại, bỏ qua test này');
            return;
        }

        await pool.initialize();
        const results = await pool.rotateIdentities();
        expect(results).toEqual([true, true]);
    }, 120000);
}); 