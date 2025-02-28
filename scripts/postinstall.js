/**
 * Script chạy sau khi cài đặt gói tor_proxy
 * Script này sẽ kiểm tra và sao chép tor.exe vào các vị trí thích hợp
 */

const fs = require('fs');
const path = require('path');

// Các đường dẫn quan trọng
const packageRoot = path.resolve(__dirname, '..');
const binDir = path.join(packageRoot, 'bin');
const torExeSrc = path.join(packageRoot, 'tor.exe');
const torExeBin = path.join(binDir, 'tor.exe');

function logSuccess(message) {
  console.log('\x1b[32m%s\x1b[0m', message); // Màu xanh lá
}

function logWarning(message) {
  console.log('\x1b[33m%s\x1b[0m', message); // Màu vàng
}

function logError(message) {
  console.log('\x1b[31m%s\x1b[0m', message); // Màu đỏ
}

function ensureBinDirectory() {
  // Tạo thư mục bin nếu chưa tồn tại
  if (!fs.existsSync(binDir)) {
    try {
      fs.mkdirSync(binDir, { recursive: true });
      logSuccess('✓ Đã tạo thư mục bin: ' + binDir);
    } catch (error) {
      logError('✗ Lỗi khi tạo thư mục bin: ' + error.message);
    }
  }
}

function copyTorExecutable() {
  // Kiểm tra nếu tor.exe tồn tại ở thư mục gốc
  if (fs.existsSync(torExeSrc)) {
    // Kiểm tra nếu tor.exe đã có sẵn trong thư mục bin
    if (!fs.existsSync(torExeBin)) {
      try {
        // Sao chép tor.exe vào thư mục bin
        fs.copyFileSync(torExeSrc, torExeBin);
        logSuccess('✓ Đã sao chép tor.exe vào thư mục bin: ' + torExeBin);
      } catch (error) {
        logError('✗ Lỗi khi sao chép tor.exe: ' + error.message);
      }
    } else {
      logSuccess('✓ tor.exe đã tồn tại trong thư mục bin: ' + torExeBin);
    }
  } else {
    logWarning(`
===================================================================
⚠️  CẢNH BÁO: Không tìm thấy tor.exe trong gói.
   Vui lòng tải xuống tor.exe từ nguồn chính thức và đặt vào một 
   trong các vị trí sau:
   - ${path.join(process.cwd(), 'tor.exe')}
   - ${path.join(process.cwd(), 'bin', 'tor.exe')}

   Đường dẫn hiện tại đang tìm kiếm tor.exe: ${torExeSrc}

   Tải Tor Browser để lấy tor.exe: https://www.torproject.org/download/

   Hoặc chỉ định đường dẫn đầy đủ khi khởi tạo TorProxy:
   const proxy = new TorProxy({ torPath: '/đường/dẫn/đến/tor.exe' });
===================================================================
    `);
  }
}

// Chỉ chạy trong môi trường sản xuất hoặc khi được cài đặt từ npm
// Tránh chạy trong quá trình phát triển hoặc testing
if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
  try {
    console.log('🔄 Đang cấu hình tor_proxy...');
    ensureBinDirectory();
    copyTorExecutable();
    logSuccess('✓ Cài đặt tor_proxy đã hoàn tất.');
    console.log('📌 Để sử dụng, hãy xem hướng dẫn trong tệp README.md');
  } catch (error) {
    logError('✗ Lỗi trong quá trình cài đặt tor_proxy: ' + error);
  }
} 