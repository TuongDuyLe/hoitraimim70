# Nghiệm thu POS 2.0.2 trên môi trường thử

Ghi URL/phiên bản/thời gian/người kiểm tra. Dùng DB và deployment thử riêng; các thao tác demo không xác nhận giao dịch ngân hàng thực tế.

## Chuẩn bị

- Sao lưu DB, chạy `npm run db:setup` trên bản sao, kiểm tra đơn và mật khẩu cũ vẫn dùng được.
- Có admin, hai tài khoản thu ngân, hai bán hàng và hai nước; mỗi món có ban phụ trách rõ ràng.
- Có ít nhất hai gian, cookie/handmade/nước, món tồn kho 1 và món không giới hạn.
- Trong Cài đặt, nhập đúng ngân hàng, BIN, số tài khoản, tên chủ tài khoản. MB Bank dùng BIN `970422`.
- Deploy frontend và Functions cùng phiên bản 2.0.2; không cần tài khoản API hoặc cấu hình callback VietQR.

## Tạo đơn và tiền

1. Thu ngân chọn giỏ chung, gom món ba loại ở nhiều gian; kiểm tra đúng tổng tiền và chỉ một đơn.
2. Tiền mặt: số tiền thiếu bị chặn, tiền thừa đúng, hoàn tất chỉ trừ kho một lần.
3. Chuyển khoản: đơn còn chờ, kho được giữ, hậu cần chưa nhận phiếu. Quét QR kiểm tra tài khoản, người nhận, tổng tiền và mã đơn.
4. Chưa bấm xác nhận: chờ thêm một lần đồng bộ hoặc tải lại trang, đơn vẫn chờ và chưa có phiếu chuẩn bị.
5. Thu ngân mở web VietQR theo dõi biến động số dư bên cạnh web hội trại hoặc kiểm tra ứng dụng ngân hàng, đối chiếu giao dịch thực nhận rồi bấm **Xác nhận đã nhận tiền** → **Xác nhận**. Đơn đã thanh toán, ghi người/thời điểm xác nhận và đúng ba phiếu chuẩn bị.
6. Bấm lặp hoặc gửi lại yêu cầu xác nhận không nhân bản phiếu/doanh thu hoặc thay đổi thời điểm xác nhận ban đầu.
7. Giữ các biến `VIETQR_*` cũ trong môi trường thử, gồm cờ bật tích hợp: thu ngân vẫn dùng QR thủ công và xác nhận được. Thông báo ngoài từ API ngân hàng không được làm thay đổi trạng thái đơn.
8. Tắt mạng khi tạo đơn, thử lại sau reload: không tạo thêm đơn. QR của đơn A không hiện trong chi tiết đơn B. Ảnh QR lỗi phải để đơn chờ và còn thông tin tài khoản/số tiền để đối chiếu.
9. Hủy đơn chưa chuyển tiền: hoàn tồn kho đúng một lần. Đơn đã hủy không được xác nhận lại; đơn đã thanh toán không bị hủy như đơn chờ.
10. Hai thiết bị tranh món tồn kho 1 và xác nhận/hủy đồng thời: kết quả DB thật nhất quán, chỉ trừ/hoàn kho và phân việc một lần.

## Các tiểu ban và phản hồi

1. Bán hàng chỉ thấy phần cookie/đồ ăn + handmade của đơn đã trả, nước chỉ thấy nước. Không thấy giá/tổng/ngân hàng, tài khoản hoặc lời nhắn riêng ban khác.
2. Gửi request trực tiếp từ nước sửa phần food, tạo đơn, xác nhận/hủy, sửa món/cài đặt/tài khoản: nhận lỗi quyền.
3. Bán hàng/nước nhận chuẩn bị rồi báo sẵn sàng; không nhảy thẳng đến đã giao. Thu ngân chỉ xác nhận giao phiếu đã ready.
4. Thu ngân nhận cảnh báo ready/lời nhắn; gửi yêu cầu tới đúng ban. Ban trả lời và thu ngân thấy đúng thread.
5. Hai đơn được thu ngân xác nhận giữa hai lần refresh: cả hai popup còn trong hàng đợi; xem chi tiết đơn đầu không làm mất popup thứ hai.
6. Phiếu có người/thời điểm xử lý, reload/đăng nhập thiết bị khác còn tiến độ. Cập nhật lặp không tạo thêm audit/phiếu.

## Tài khoản, lịch sử và giao diện

1. Admin tạo nhiều người cùng ban, đổi quyền/password/khóa: phiên cũ bị thu hồi. Không tự khóa/hạ admin hoặc mất admin cuối.
2. Khi phiên hết hạn, đăng nhập ban khác không nhìn thấy popup/đơn của phiên trước.
3. Lọc lịch sử ngày, phương thức, thanh toán, gian, ban, tiến độ, khoảng tiền, tìm món/tên/ghi chú; thống kê và CSV khớp các đơn đã lọc. Chuẩn bị không có cột/filter tiền.
4. Báo cáo riêng mỗi gian tính đúng phần món từ đơn chung; tổng toàn hệ thống không cộng trùng các đơn.
5. Thu ngân giỏ chung; admin chuyển sang Thực đơn phải chọn một gian thật và thêm món được.
6. Thử điện thoại 360–390px và laptop: bảng lọc, phiếu, form, QR/chi tiết không bị cắt. Bàn phím dùng được, focus rõ.
7. Thử in phiếu 80mm: không in popup, navigation hoặc thread. Kiểm tra trên máy in thật.

## Trước khi mở bán

Chạy luồng tạo đơn → QR → thu ngân kiểm tra tiền → xác nhận → chia phiếu → phản hồi → giao khách trên HTTPS và DB thử. Kiểm tra log Netlify/TLS Aiven, sao lưu/khôi phục và quyền từng ban. Ứng dụng không tự đọc ngân hàng hoặc hoàn tiền; việc đối soát tiền nhận do thu ngân thực hiện.
