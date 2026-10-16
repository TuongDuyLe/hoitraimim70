# Kiểm thử trước ngày hội trại

Tài liệu này mô tả luồng xác nhận thủ công của bản trước. Với POS 2.0 và VietQR tự động, dùng thêm [checklist nâng cấp](upgrade-qa.md).

Thực hiện trên DB thử nghiệm và tài khoản ngân hàng thử đã được người nhận xác nhận. Ghi phiên bản code, URL, thời gian, người kiểm tra và kết quả vào cuối tài liệu. Các tình huống dưới đây là tiêu chí nghiệm thu, không phải kết quả đã được chạy trên Aiven/Netlify thật. Kiểm tra trực quan chưa thực hiện được trong môi trường thực thi vì trình duyệt không truy cập được server loopback; cần chạy trên máy hoặc URL deploy của bạn.

## 1. Chuẩn bị

- Có một quản trị viên, hai người bán A/B, mỗi người bán có ít nhất hai món.
- Một món của A tồn kho 1; một món tạm ngừng bán; một món tồn kho không giới hạn nếu giao diện hỗ trợ.
- Cấu hình tài khoản ngân hàng nhận tiền chung của hội trại; ghi nhận giá một món trước khi tạo đơn.
- Mở hai trình duyệt hoặc cửa sổ riêng để kiểm thử đồng thời và phân quyền.
- Chạy `npm run test` và `npm run build`; sau deploy kiểm tra API và giao diện cùng hoạt động.

## 2. Lên đơn và tiền mặt

1. Đăng nhập người bán A, thêm hai món, tăng/giảm số lượng, bỏ một món và kiểm tra tổng tiền.
2. Chọn tiền mặt, nhập tiền khách đưa lớn hơn tổng tiền, kiểm tra tiền thừa rồi bấm thu tiền/hoàn tất để tạo đơn đã thanh toán.
3. Mở danh sách đơn và kiểm tra mã đơn, món, số lượng, giá tại thời điểm bán, phương thức, trạng thái.
4. Tải lại trang và mở trên thiết bị khác: đơn phải còn trong hệ thống thật.
5. Thử tiền khách đưa nhỏ hơn tổng tiền và số âm: phải bị từ chối.
6. Thử giỏ rỗng, số lượng 0/âm/quá lớn, món ngừng bán: không được tạo đơn sai.
7. Đổi giá món sau khi đã tạo đơn: đơn cũ giữ nguyên giá và tổng tiền.

## 3. Chuyển khoản QR và người bán xác nhận

1. Tạo đơn chuyển khoản, kiểm tra trạng thái chờ thanh toán.
2. Dùng ứng dụng ngân hàng quét QR. Kiểm tra ngân hàng, số tài khoản, tên người nhận, số tiền và nội dung có mã đơn. Chưa gửi tiền trong bước kiểm tra này.
3. Đóng QR/tải lại trang: đơn vẫn chờ, không tự chuyển sang đã thanh toán.
4. Làm một đơn nhỏ được chủ tài khoản cho phép. Khách chuyển đúng QR, người bán kiểm tra giao dịch đã ghi có trên ứng dụng ngân hàng của tài khoản nhận.
5. Trước khi người bán xác nhận trên website, đơn vẫn chờ dù khách đã chuyển tiền. Website chỉ hiển thị QR, không đọc tài khoản ngân hàng.
6. Người bán bấm xác nhận đã nhận tiền và xác nhận trong hộp thoại. Kiểm tra trạng thái đã thanh toán và nguồn `manual`.
7. Kiểm tra doanh thu tăng đúng tổng tiền một lần, đơn lưu thời gian và người xác nhận, nhật ký `order_audit` có hành động `confirmed`. Xem dữ liệu trong DB nếu giao diện không hiển thị người xác nhận.
8. Chặn `img.vietqr.io` trong DevTools để thử lỗi ảnh: khách vẫn đọc được thông tin chuyển khoản và số tiền; trạng thái đơn không đổi.
9. Tải lại trang, đăng xuất/đăng nhập và mở trên thiết bị khác: trạng thái đã thanh toán vẫn được lưu; doanh thu không biến mất.
10. Bấm xác nhận lại cùng đơn hoặc hai thiết bị xác nhận đồng thời: không cộng doanh thu/trừ kho thêm lần nữa và chỉ có một lần ghi nhật ký xác nhận.
11. Thay cài đặt tài khoản ngân hàng sau khi tạo đơn: QR và thông tin nhận tiền của đơn cũ giữ nguyên theo bản chụp lúc tạo; đơn mới dùng tài khoản mới.
12. Thử chuyển thiếu, sai nội dung hoặc chỉ đưa ảnh chụp giao dịch: người bán giữ trạng thái chờ cho đến khi kiểm tra đủ tiền cho đúng đơn. Website không tự phân biệt những trường hợp này.
13. Tắt mạng khi xác nhận: có báo lỗi nếu chưa nhận phản hồi. Sau khi kết nối lại, tải trạng thái đơn trước khi thao tác tiếp; không báo thành công giả và không xác nhận trùng.

QR có số tiền/nội dung giúp nhập giao dịch nhanh. QR hoặc ảnh chụp biên lai không xác nhận ngân hàng đã ghi có. Quy trình bắt buộc người bán đối chiếu tiền thực nhận rồi xác nhận trên website.

## 4. Phân quyền

| Thao tác | Quản trị | Người bán A | Chưa đăng nhập |
| --- | --- | --- | --- |
| Xem/quản lý gian hàng và người bán | Theo giao diện quản trị | Chỉ phạm vi được phép | Bị từ chối |
| Tạo/sửa món của A | Được | Được | Bị từ chối |
| Tạo/sửa món của B | Được | Bị từ chối | Bị từ chối |
| Xem đơn của A | Được | Được | Bị từ chối |
| Xem/xác nhận/hủy đơn của B | Được | Bị từ chối | Bị từ chối |
| Sửa tài khoản ngân hàng chung | Được | Bị từ chối | Bị từ chối |

Kiểm tra cả giao diện lẫn API: thay ID gian hàng/đơn trong request của A thành ID của B phải nhận lỗi phân quyền. Việc ẩn nút trên giao diện chưa đủ. Sau đăng xuất, API có bảo vệ phải từ chối truy cập. Không được trả password hash, bí mật JWT hay URI DB trong response.

## 5. Tồn kho, thao tác lặp và đồng thời

1. Hai thiết bị đặt món tồn kho 1 cùng lúc. Chỉ một đơn được tạo thành công; kho không âm.
2. Bấm nút tạo đơn hai lần nhanh, thử lại sau mất mạng khi server đã nhận đơn. Cùng khóa yêu cầu phải trả cùng đơn, không tạo hai đơn hoặc trừ kho hai lần.
   Kiểm tra cả trường hợp tải lại trang sau lỗi mạng: giỏ, phương thức, tiền khách đưa và khóa yêu cầu phải giữ đủ dữ liệu để thử lại cùng yêu cầu.
3. Gửi cùng khóa yêu cầu với nội dung giỏ khác: bị từ chối thay vì gộp đơn sai.
4. Hủy một đơn chưa thanh toán: kho hoàn lại đúng một lần. Hủy lại không hoàn thêm.
5. Hai thiết bị vừa xác nhận vừa hủy một đơn: kết quả nhất quán, không có trạng thái vừa thanh toán vừa hủy.
6. Thử hủy đơn đã thanh toán: phải theo giới hạn của API; không tự hoàn tiền ngân hàng.
7. Đơn nhiều món có một món hết kho: toàn bộ tạo đơn thất bại; món còn lại không bị trừ kho.

## 6. Demo, lỗi mạng và di động

- Chế độ demo có nhãn rõ ràng; dữ liệu demo lưu ở trình duyệt và không xuất hiện trong DB thật.
- Đăng nhập hệ thống thật không đọc/ghi nhầm đơn demo.
- Tắt mạng hoặc làm DB không truy cập được: có thông báo lỗi; không báo thanh toán/tạo đơn thành công giả.
- Trên điện thoại rộng khoảng 360–390 px: chọn món, giỏ hàng, QR, form và nút xác nhận không bị cắt hoặc che.
- Nhập tên/note chứa `<script>` hoặc dấu nháy: hiển thị như văn bản, không chạy mã.
- Bàn phím dùng được với form/nút chính, trạng thái có chữ rõ ràng, không chỉ phân biệt bằng màu.

## 7. Vận hành và sao lưu

- Trước mở bán: kiểm tra thông tin ngân hàng chung, giá, món đang bán, tồn kho, quyền người bán và kết nối Internet.
- Chọn một người chịu trách nhiệm đối soát tiền; chỉ xác nhận sau khi thấy đủ tiền đã vào tài khoản cho đúng đơn.
- Kiểm tra danh sách đơn chờ, hỏi người bán đã đối chiếu các khoản chuyển thiếu/sai nội dung chưa. Trạng thái thanh toán phụ thuộc thao tác xác nhận của người có quyền.
- Cuối ca: đối chiếu đơn đã thanh toán theo tiền mặt/chuyển khoản với tiền thực tế. Đơn chờ không tính là tiền đã nhận.
- Xuất báo cáo nếu giao diện có hỗ trợ; báo cáo không thay thế bản sao lưu DB.
- Kiểm tra khả năng lưu/khôi phục của gói Aiven đang dùng, và thử khôi phục sang DB thử. Xem [Aiven: sao lưu PostgreSQL](https://aiven.io/docs/products/postgresql/concepts/pg-backups) và [khôi phục backup](https://aiven.io/docs/products/postgresql/howto/restore-backup).
- Tạo logical backup bằng `pg_dump` trước/sau hội trại nếu cần lưu bản riêng; bảo quản ở nơi hạn chế truy cập. Xem [Aiven: backup bằng pg_dump](https://aiven.io/docs/products/postgresql/howto/create-manual-backups).

## Biên bản kết quả

| Phiên bản/URL | Thời gian | Người kiểm tra | Nhóm tình huống | Kết quả/lỗi còn lại |
| --- | --- | --- | --- | --- |
| | | | | |
