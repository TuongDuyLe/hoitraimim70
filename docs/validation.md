# Kiểm tra POS 2.0.2 · 16/10/2026

Bản 2.0.2 đưa chuyển khoản về QR có tổng tiền và xác nhận thủ công của thu ngân. Giữ phân quyền, giỏ nhiều gian, lịch sử/bộ lọc/thống kê, phiếu chuẩn bị, lời nhắn và thông báo giữa các ban. Phần API nhận thông báo thanh toán tự động đã được loại khỏi luồng ứng dụng.

## Trạng thái kiểm tra bản này

Kết quả đã chạy trên source 2.0.2:

- `npm test`: **91/91 kiểm thử đạt**, trong 7 tệp kiểm thử.
- `npm run build`: kiểm tra TypeScript và build Vite đạt.
- Đóng gói Netlify API bằng esbuild đạt; đã tạo demo HTML độc lập từ build này.
- Migration smoke trên PGlite: đạt với dữ liệu cũ và DB mới, mỗi trường hợp áp dụng hai lần; bảo toàn dữ liệu lịch sử.

Các lệnh cần chạy:

```powershell
npm test
npm run build
```

Luồng hồi quy bao gồm:

- QR dùng đúng tài khoản lưu theo đơn, tổng tiền và mã đơn; chỉ thu ngân/người có quyền xác nhận mới chuyển đơn chờ sang đã trả tiền.
- Cờ môi trường VietQR cũ không chặn thu ngân xác nhận thủ công; các điểm nhận callback cũ không xác nhận đơn.
- Xác nhận/hủy lặp không nhân bản phiếu hoặc trừ/hoàn tồn kho nhiều lần; đơn hủy không được hồi sinh.
- Giỏ nhiều gian, phân việc đúng ban, phản hồi/giao khách, quyền hậu cần, hàng đợi popup, tài khoản và bộ lọc lịch sử vẫn hoạt động.
- Migration giữ đơn, mật khẩu, tồn kho, tiến độ và dữ liệu thanh toán lịch sử, kể cả các bảng của tích hợp cũ.

## Phạm vi và nghiệm thu thực tế

Backend kiểm tra bằng pg-mem; luồng giao diện dùng React Testing Library + happy-dom. Kiểm tra migration trên PGlite giúp kiểm chứng cú pháp và trạng thái dữ liệu, chưa chứng minh khóa/rollback đồng thời trên PostgreSQL hosted.

Chưa xác nhận deploy Netlify hoặc kết nối DB Aiven thật cho bản 2.0.2. Cần thực hiện [nghiệm thu 2.0.2](upgrade-qa.md) trên HTTPS/DB thử, quét QR trong ứng dụng ngân hàng và kiểm tra máy in thực trước mở bán. Demo chỉ lưu dữ liệu mẫu trong trình duyệt; không chuyển tiền hoặc đọc giao dịch ngân hàng.
