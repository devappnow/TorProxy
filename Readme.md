# TorProxy

Một thư viện Node.js đơn giản để tạo và quản lý các kết nối proxy Tor. Thư viện này cho phép bạn khởi chạy một hoặc nhiều instance Tor để luân chuyển địa chỉ IP và tạo các kết nối ẩn danh.

## Tính năng chính

- Tạo và quản lý một hoặc nhiều instance Tor
- Tạo pool các proxy Tor cho các công việc cần nhiều IP
- Luân chuyển danh tính (IP) dễ dàng
- Cấu hình tùy chỉnh cho mỗi instance Tor
- Tự động dọn dẹp tài nguyên khi kết thúc

## Lưu ý quan trọng

> **Thời gian khởi động:** Quá trình khởi động Tor có thể mất đến 90 giây tùy thuộc vào cấu hình máy tính và mạng của bạn. Trong môi trường chậm, bạn có thể cần phải điều chỉnh thời gian timeout bằng cách tùy chỉnh mã nguồn.

> **Yêu cầu tor.exe:** Đảm bảo tệp tor.exe được đặt đúng vị trí như mô tả trong phần cài đặt bên dưới. Nếu không, quá trình khởi động sẽ thất bại.

## Cài đặt

```bash
npm install tor-proxy
```

### Yêu cầu

- Node.js 12.0.0 trở lên
- Windows (hiện tại chỉ hỗ trợ Windows do sử dụng tor.exe)
- Tor executable (`tor.exe`) phải có trong dự án (xem phần hướng dẫn bên dưới)

### Cài đặt tor.exe

Thư viện này yêu cầu tệp `tor.exe` để hoạt động. Có một vài cách để đảm bảo tệp này được tìm thấy:

1. **Cách 1** (được khuyến nghị): Đặt `tor.exe` vào thư mục gốc của dự án của bạn
   ```
   project-folder/
   ├── node_modules/
   ├── tor.exe          <-- Đặt tor.exe ở đây
   ├── package.json
   └── các file khác...
   ```

2. **Cách 2**: Chỉ định đường dẫn đến tor.exe khi khởi tạo:
   ```javascript
   const proxy = new TorProxy({
     torPath: '/đường/dẫn/đến/tor.exe'
   });
   ```

3. **Cách 3**: Thêm tor.exe vào biến PATH của hệ thống

> **Lưu ý**: Bạn có thể tải xuống tor.exe từ trang web chính thức của Tor Project hoặc từ [repository](https://github.com/torydev/tor-proxy-binaries/releases) (đường dẫn này chỉ là ví dụ, vui lòng tạo repo của riêng bạn).

## Sử dụng cơ bản

### Sử dụng TorProxy đơn lẻ

```javascript
const { TorProxy } = require('./torProxy');

async function main() {
  try {
    // Tạo một instance TorProxy mới
    const proxy = new TorProxy({
      socksPort: 9050,  // Cổng SOCKS mặc định của Tor
      controlPort: 9051 // Cổng điều khiển mặc định của Tor
    });

    // Khởi động proxy
    const proxyInfo = await proxy.start();
    console.log('Tor proxy đã khởi động:', proxyInfo);

    // Thông tin kết nối proxy
    console.log(`Sử dụng proxy SOCKS5: socks5://127.0.0.1:${proxyInfo.socksPort}`);

    // Đợi 30 giây
    console.log('Đợi 30 giây...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Nhận danh tính mới (đổi IP)
    console.log('Đổi IP...');
    const success = await proxy.getNewIdentity();
    console.log('Đổi IP thành công:', success);

    // Đợi thêm 30 giây
    console.log('Đợi thêm 30 giây...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Dừng proxy và dọn dẹp
    await proxy.stop();
    console.log('Tor proxy đã dừng');
  } catch (error) {
    console.error('Lỗi:', error);
  }
}

main();
```

### Sử dụng TorProxyPool

```javascript
const { TorProxyPool } = require('./torProxy');

async function main() {
  try {
    // Tạo pool với 3 proxy Tor, bắt đầu từ cổng 9050
    const pool = new TorProxyPool(3, 9050);
    
    // Khởi tạo tất cả các proxy trong pool
    console.log('Khởi động pool proxy...');
    await pool.initialize();
    console.log('Pool proxy đã sẵn sàng');

    // Lấy một proxy cụ thể từ pool (ID từ 1 đến 3)
    const proxy = pool.getProxy(1);
    console.log(`Sử dụng proxy SOCKS5: socks5://127.0.0.1:${proxy.socksPort}`);

    // Đợi 30 giây
    console.log('Đợi 30 giây...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Luân chuyển tất cả danh tính trong pool
    console.log('Đổi tất cả các IP trong pool...');
    const results = await pool.rotateIdentities();
    console.log('Kết quả đổi IP:', results);

    // Đợi thêm 30 giây
    console.log('Đợi thêm 30 giây...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    // Dọn dẹp và đóng tất cả proxy
    await pool.cleanup();
    console.log('Pool proxy đã đóng');
  } catch (error) {
    console.error('Lỗi:', error);
  }
}

main();
```

## Ví dụ thực tế: Gửi HTTP request qua Tor

```javascript
const { TorProxy } = require('./torProxy');
const axios = require('axios');
const SocksProxyAgent = require('socks-proxy-agent');

async function checkIP(agent) {
  try {
    const response = await axios.get('https://api.ipify.org?format=json', { 
      httpsAgent: agent 
    });
    return response.data.ip;
  } catch (error) {
    console.error('Lỗi khi kiểm tra IP:', error.message);
    return null;
  }
}

async function main() {
  const proxy = new TorProxy();
  
  try {
    // Khởi động Tor proxy
    const proxyInfo = await proxy.start();
    console.log('Tor proxy đã khởi động:', proxyInfo);
    
    // Tạo SOCKS proxy agent
    const agent = new SocksProxyAgent(`socks5://127.0.0.1:${proxyInfo.socksPort}`);
    
    // Kiểm tra IP ban đầu
    console.log('IP hiện tại:', await checkIP(agent));
    
    // Đổi IP
    console.log('Đổi IP...');
    await proxy.getNewIdentity();
    
    // Đợi Tor thiết lập mạch mới
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Kiểm tra IP mới
    console.log('IP mới:', await checkIP(agent));
    
  } catch (error) {
    console.error('Lỗi:', error);
  } finally {
    // Luôn đảm bảo dọn dẹp
    await proxy.stop();
    console.log('Tor proxy đã dừng');
  }
}

main();
```

> **Lưu ý:** Ví dụ này yêu cầu cài đặt thêm gói `axios`: `npm install axios`. Gói `socks-proxy-agent` đã được bao gồm trong dependencies của thư viện.

## API Reference

### Lớp TorProxy

#### Constructor

```javascript
new TorProxy({
  id: Number,           // ID của proxy (mặc định: timestamp hiện tại)
  socksPort: Number,    // Cổng SOCKS (mặc định: 9050)
  controlPort: Number,  // Cổng điều khiển (mặc định: 9051)
  dataDir: String       // Thư mục dữ liệu (mặc định: thư mục tạm + tor-{id})
})
```

#### Phương thức

- `async start()`: Khởi động proxy Tor, trả về thông tin kết nối
- `async getNewIdentity()`: Yêu cầu danh tính (IP) mới
- `async stop()`: Dừng proxy Tor và dọn dẹp tài nguyên
- `async cleanup()`: Dọn dẹp tài nguyên (được gọi bởi stop)

### Lớp TorProxyPool

#### Constructor

```javascript
new TorProxyPool(
  size: Number,       // Số lượng proxy trong pool (mặc định: 5)
  startPort: Number   // Cổng bắt đầu (mặc định: 9050)
)
```

#### Phương thức

- `async initialize()`: Khởi tạo tất cả các proxy trong pool
- `getProxy(id)`: Lấy một proxy cụ thể từ pool theo ID
- `async rotateIdentities()`: Đổi danh tính cho tất cả các proxy
- `async cleanup()`: Dọn dẹp và đóng tất cả các proxy

## Lưu ý

- Đảm bảo rằng file `tor.exe` được đặt trong thư mục gốc của dự án
- Mỗi instance Tor cần hai cổng liên tiếp (SOCKS và Control)
- Có thể mất đến 45 giây để khởi động Tor hoàn toàn
- Nên luôn gọi `stop()` hoặc `cleanup()` để giải phóng tài nguyên

## License

MIT
