# QR chuyển khoản và xác nhận thủ công · 2.0.2

Bản này vẫn lấy QR từ VietQR theo số tiền đơn hàng: chọn món → thanh toán → hiện QR đúng tổng tiền → thu ngân đối chiếu giao dịch → bấm xác nhận. Không cần cấu hình tài khoản API, API key hoặc callback trong web hội trại. Bạn vẫn có thể dùng web VietQR để xem biến động số dư ở một cửa sổ bên cạnh.

## 1. Đưa bản mới lên Netlify

Website đang dùng: [hoitrai1.netlify.app](https://hoitrai1.netlify.app/).

Deploy toàn bộ source 2.0.2 gồm frontend và Netlify Functions. Cấu hình build là `npm run build`, thư mục publish là `dist`, thư mục Functions là `netlify/functions`; các mục này đã có trong `netlify.toml`. Nếu Netlify nối Git, đẩy source mới rồi chạy deploy. Nếu deploy qua công cụ Netlify, dùng quy trình hiện có để deploy cả Functions.

Giữ các biến môi trường database, CA, JWT và thông tin quản trị theo `.env.example`. Các biến bắt đầu bằng `VIETQR_` của bản tích hợp cũ không còn được dùng và có thể xóa khỏi Netlify. Chạy deploy lại sau khi đổi source/biến môi trường. Không cần khai báo URL nhận giao dịch với VietQR.

Việc sửa source ở máy tính chưa tự cập nhật website Netlify. Sau deploy, đăng nhập và kiểm tra màn hình thanh toán đã dùng nút xác nhận thủ công.

## 2. Nhập tài khoản MB Bank

1. Đăng nhập bằng tài khoản **Quản trị**.
2. Mở **Cài đặt** → **Tài khoản nhận chuyển khoản**.
3. Điền các trường bên dưới rồi bấm **Lưu cài đặt**.

| Trường | Nội dung |
| --- | --- |
| Ngân hàng | `MB Bank` |
| Mã BIN ngân hàng | `970422` |
| Số tài khoản | Số tài khoản MB thực tế nhận tiền của bạn |
| Tên chủ tài khoản | Tên chủ tài khoản đúng theo ngân hàng |

Thông tin này áp dụng chung cho các gian hàng. Mỗi đơn lưu thông tin ngân hàng tại thời điểm tạo; thay cài đặt không đổi tài khoản nhận của đơn đã có. Nếu muốn thử tài khoản mới, tạo đơn mới và kiểm tra lại QR.

## 3. Thu ngân nhận tiền chuyển khoản

1. Chọn món; dùng **Tất cả gian hàng · giỏ chung** nếu gom món nhiều gian.
2. Chọn phương thức **Chuyển khoản** và tạo đơn thanh toán.
3. Màn hình hiện QR, ngân hàng, số tài khoản, tổng tiền và mã đơn làm nội dung chuyển khoản. QR tải từ `img.vietqr.io` và tự điền số tiền/mã đơn.
4. Khách quét QR. Kiểm tra ngân hàng, người nhận, số tiền và nội dung trong ứng dụng ngân hàng trước khi khách chuyển.
5. Thu ngân xem giao dịch ghi có trên web VietQR theo dõi biến động số dư của bạn hoặc ứng dụng ngân hàng của tài khoản nhận. Đối chiếu đúng tài khoản, số tiền và mã đơn; chỉ khách bấm chuyển hoặc đưa ảnh giao dịch chưa làm đơn được thanh toán trong hệ thống.
6. Khi đã kiểm tra tiền thực nhận, bấm **Xác nhận đã nhận tiền**. Ở câu hỏi **Bạn đã kiểm tra tiền vào ngân hàng?**, bấm **Xác nhận**.
7. Đơn chuyển sang đã thanh toán, ghi người/thời điểm xác nhận và được chia cho các ban chuẩn bị.

Quét QR hoặc tải lại trang không tự xác nhận đơn. Chuyển thiếu/thừa hoặc sai nội dung cần thu ngân đối chiếu trực tiếp trước khi quyết định xác nhận. Nếu chưa nhận tiền, giữ đơn chờ; chỉ hủy khi khách chưa chuyển tiền.

Có thể đặt cửa sổ web VietQR cạnh cửa sổ hội trại: một bên xem giao dịch thực nhận, một bên mở đúng đơn để đối chiếu và bấm xác nhận. Hai trang hoạt động độc lập; mở trang VietQR không tự thay trạng thái đơn hội trại.

Đơn chờ giữ tồn kho. Sau khi thu ngân xác nhận, ban bán hàng nhận đồ ăn/cookie + handmade, ban nước nhận phần nước. Các ban báo đang chuẩn bị/sẵn sàng và nhắn lại cho thu ngân; những thông báo vận hành này vẫn được giữ.

## 4. Thử trước khi bán

- Tạo một đơn chuyển khoản thử và quét QR bằng ứng dụng MB: kiểm tra đúng tài khoản, người nhận, số tiền và mã đơn trước khi chuyển. Không xác nhận giao dịch ngân hàng nếu chỉ muốn kiểm tra nội dung QR.
- Để đơn chờ và tải lại trang: đơn vẫn chờ, các ban chưa được giao phiếu.
- Dùng demo để thử thao tác **Xác nhận đã nhận tiền** → **Xác nhận** và chuyển vai trò để kiểm tra phiếu chuẩn bị/lời nhắn. Demo không chuyển tiền thật và không đồng bộ giữa thiết bị.
- Với đơn vận hành thực, chỉ xác nhận sau khi kiểm tra tiền vào tài khoản. Kiểm tra lịch sử hiển thị đúng trạng thái và thời điểm thanh toán; thông tin người xác nhận được lưu tại máy chủ.
- Nếu ảnh QR không tải, kiểm tra mạng và thông tin ngân hàng trong Cài đặt. Màn hình vẫn hiển thị số tài khoản, số tiền và mã đơn để đối chiếu; đơn chưa được tự thanh toán.

## 5. Dữ liệu và cấu hình cũ

Chuyển về thủ công không xóa đơn, tài khoản, lịch sử thanh toán hoặc phiếu chuẩn bị. Các bảng/migration của tích hợp thanh toán trước đây được giữ để bảo toàn dữ liệu lịch sử, nhưng ứng dụng không còn tạo QR động qua API hoặc nhận callback xác nhận tiền.

Không phải sửa DB để bật chế độ thủ công. Khi nâng DB từ bản trước 2.0, vẫn sao lưu và chạy `npm run db:setup` theo README để có phần phân quyền/chuẩn bị/lời nhắn.
