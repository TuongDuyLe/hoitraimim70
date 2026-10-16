# Trại Vui · Hội Trại POS 2.0.2

Website tiếng Việt cho hội trại: thu ngân lên đơn, khách thanh toán, các tiểu ban nhận phần việc và phản hồi tiến độ. React + TypeScript + Vite, Netlify Functions và PostgreSQL/Aiven.

## Luồng bán hàng

1. Thu ngân chọn **Tất cả gian hàng · giỏ chung**, gom đồ ăn/cookie, handmade và nước trong một đơn.
2. Tiền mặt: nhập tiền khách đưa và kiểm tra tiền thừa. Chuyển khoản: tạo đơn chờ, hiển thị QR có sẵn tổng tiền, tài khoản nhận và mã đơn.
3. Thu ngân kiểm tra giao dịch thực tế trong ứng dụng ngân hàng, bấm **Xác nhận đã nhận tiền**, rồi xác nhận lần nữa. Đơn chỉ ghi nhận thanh toán sau bước này.
4. Đơn đã trả tiền chia thành phiếu đồ ăn, handmade và nước. Ban bán hàng nhận đồ ăn + handmade; hậu cần nhận nước.
5. Các ban nhận chuẩn bị → báo sẵn sàng. Thu ngân xác nhận đã giao khi giao khách.
6. Lời nhắn gắn với đơn/ban giúp phản hồi yêu cầu, thiếu món, thời gian chờ. Thu ngân có cảnh báo khi phần việc sẵn sàng hoặc có lời nhắn mới.

Thanh toán vẫn lấy ảnh QR từ VietQR qua `img.vietqr.io` như luồng ban đầu, có sẵn số tiền đơn hàng và mã đơn. Không cần cấu hình tài khoản API, API key hoặc callback. Thu ngân có thể mở web VietQR theo dõi biến động số dư bên cạnh web hội trại, đối chiếu giao dịch rồi xác nhận thủ công. Ứng dụng hội trại không tự nhận thông báo chuyển khoản; những biến môi trường VietQR API cũ không còn điều khiển việc xác nhận.

Thông báo đơn và phản hồi giữa các ban vẫn hoạt động. Popup xử lý theo hàng đợi; dữ liệu cập nhật mỗi ba giây khi trang hoạt động. Không có push nền/service worker, nên chưa bảo đảm thông báo khi đóng trang hoặc thiết bị dừng trình duyệt.

## Phân quyền

| Vai trò | Quyền |
| --- | --- |
| Quản trị | Tài khoản, gian, món, cài đặt, đơn, báo cáo, xử lý mọi ban và xác nhận thanh toán. |
| Thu ngân | Lên đơn nhiều gian, thu tiền mặt, hiển thị QR và xác nhận chuyển khoản thủ công, hủy đơn chờ, lịch sử/báo cáo, nhắn các ban, xác nhận đã giao. Không sửa tài khoản, món hoặc ngân hàng. |
| Bán hàng | Đơn đã trả tiền có đồ ăn/cookie hoặc handmade; xử lý phần việc và nhắn thu ngân. Không tạo đơn, thu tiền hoặc xem dữ liệu tiền/ngân hàng. |
| Chuẩn bị nước | Phần nước của đơn đã trả tiền; nhận chuẩn bị, báo sẵn sàng và phản hồi. Không xem phần việc ban khác hoặc dữ liệu tiền. |
| Người bán gian hàng cũ | Giữ quyền quản lý món/đơn trong gian được gán, phục vụ dữ liệu phiên bản trước. |

API kiểm tra quyền độc lập với giao diện. Quản trị tạo nhiều tài khoản cho từng vai trò, đổi quyền/mật khẩu, khóa tài khoản. Đổi quyền, mật khẩu hoặc trạng thái thu hồi phiên cũ. Không được tự khóa/hạ quyền quản trị hoặc làm mất quản trị hoạt động cuối cùng.

Trong **Thực đơn**, đặt **Ban phụ trách chuẩn bị** cho từng món: đồ ăn/cookie, handmade hoặc nước. Loại món được lưu theo đơn để thay đổi catalog không sửa ngược lịch sử.

## Lịch sử, thống kê và trao đổi

**Đơn hàng** có tìm kiếm mã/khách/món/ghi chú, khoảng ngày Việt Nam, phương thức/trạng thái thanh toán, gian, ban, tiến độ, khoảng tổng tiền; reset lọc, phân trang, thống kê và CSV. Thống kê cộng các đơn sau lọc; hậu cần chỉ thấy số món/phần việc của mình.

**Báo cáo** theo ngày tạo đơn và giờ Việt Nam, doanh thu đã trả, món bán chạy, phương thức. Chọn một gian sẽ chỉ tính món thuộc gian đó trong đơn nhiều gian. **Chuẩn bị & trao đổi** có phiếu theo ban, trạng thái, người xử lý và lời nhắn theo đơn. Phiếu bán hàng có CSS rộng 80 mm; cần thử máy in thực.

## Chạy demo và source

Cài Node.js 22.12 trở lên, mở terminal tại thư mục có `package.json`:

```powershell
npm ci
npm run dev
```

Mở `http://127.0.0.1:5173`, chọn **Khám phá bản demo**, hoặc thêm `?demo=1`. Bộ chọn vai trò trên thanh đầu trang cho thử quản trị, thu ngân, bán hàng, nước. Đơn demo chuyển khoản cũng dùng nút **Xác nhận đã nhận tiền** và bước xác nhận lại; dữ liệu thanh toán chỉ là dữ liệu mẫu trong trình duyệt.

Demo lưu riêng trong localStorage, không đồng bộ giữa máy và không dùng vận hành thật. API thật không tự chuyển sang demo khi lỗi. Tạo demo HTML độc lập:

```powershell
npm run build
node scripts/build-demo.mjs hoi-trai-pos-manual-demo.html
```

## Database mới hoặc nâng dữ liệu cũ

Chuẩn bị PostgreSQL, URI và CA từ Aiven. Sao chép `.env.example` thành `.env` rồi điền `DATABASE_URL`, CA PEM hoặc base64, `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `ADMIN_NAME`. Giữ `SEED_SAMPLE_DATA=false` cho vận hành. Mật khẩu bootstrap tối thiểu 12 ký tự, có chữ hoa/chữ thường/số, tối đa 72 byte UTF-8.

Giữ credentials ở server; không dùng tiền tố `VITE_`, đưa vào Git hoặc gửi trong chat. Sao lưu và thử trên bản sao DB trước khi nâng dữ liệu vận hành.

```powershell
npm run db:setup
```

Script chạy `schema.sql`, `upgrade-v2.sql`, `payments-v2.sql` trong transaction, giữ đơn/tài khoản/mật khẩu cũ, thêm loại món và phiếu chuẩn bị. Chạy lại không reset mật khẩu hoặc nhân bản phiếu. Migration thanh toán cũ được giữ để tương thích dữ liệu đã có; nó không bật kết nối ngân hàng. Không xóa bảng/cột hoặc bằng chứng thanh toán lịch sử khi chuyển về xác nhận thủ công.

Khi nâng cấp, cấu hình đúng tên quản trị hiện có. Sau đó tạo tài khoản các ban và kiểm tra phân loại món suy đoán từ dữ liệu cũ.

## Cài đặt QR chuyển khoản

Đăng nhập quản trị → **Cài đặt** → **Tài khoản nhận chuyển khoản**. Nhập ngân hàng, mã BIN, số tài khoản và tên chủ tài khoản rồi lưu. Với tài khoản MB Bank của bạn, dùng BIN `970422`. QR tự điền tổng tiền và mã đơn; thu ngân luôn kiểm tra giao dịch vào tài khoản trước khi xác nhận.

[Hướng dẫn thao tác QR và xác nhận thủ công](docs/vietqr-setup.md) có các bước cho website `https://hoitrai1.netlify.app/`. Không cần tiếp tục đăng ký API/callback tại VietQR.vn. Có thể xóa các biến `VIETQR_*` cũ khỏi Netlify; giữ nguyên cấu hình DB/JWT và tài khoản quản trị.

## Deploy và kiểm tra

Netlify: build `npm run build`, publish `dist`, functions `netlify/functions`; `netlify.toml` đã khai báo. Deploy cả frontend và Functions từ source. Upload riêng `dist` chưa đủ backend. Thêm các biến DB/JWT trong `.env.example` ở server Functions, chạy migration đúng DB trước deploy. Sau khi thay source hoặc biến môi trường, deploy lại để website chạy bản mới.

```powershell
npm test
npm run build
```

`docs/validation.md` ghi trạng thái kiểm tra của bản 2.0.2. Backend dùng pg-mem; React dùng happy-dom; `tests/migration-smoke.md` hướng dẫn kiểm tra migration trên PostgreSQL nhúng. Hosted PostgreSQL đồng thời, QR trong app ngân hàng, giao diện và máy in thực vẫn cần nghiệm thu.

## Cấu trúc và giới hạn

`src/`: giao diện/demo/client/giỏ; `Operations.tsx`: lịch sử, phiếu, lời nhắn, tài khoản. `server/`: quyền, catalog, đơn, workflow, tài khoản, DB. `database/`: schema/migration. `netlify/functions/`: handler. `scripts/`: DB/demo. `tests/`: regression/quyền/thanh toán/UI/migration. `docs/`: hướng dẫn/QA.

Đơn chờ giữ kho cho đến khi hủy. Chưa có tự hết hạn đơn, hoàn tiền, thẻ, hóa đơn điện tử hoặc đồng bộ offline. Backup DB trước/sau hội trại; CSV không thay backup. Ứng dụng không tự đọc tài khoản ngân hàng hoặc chuyển tiền trả khách.
