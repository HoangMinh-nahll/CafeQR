# CAFE QR ORDERING WEBSITE – GROUP 7

Bộ source code mới, thống nhất cho website đặt món tại quán cà phê bằng QR Code.

- Website, không phải native mobile app.
- Frontend: HTML, CSS, JavaScript (được Spring Boot phục vụ cùng domain).
- Backend: Java 17 + Spring Boot 3.5.16 + JDBC.
- Database: Neon PostgreSQL.
- Public hosting: Render Web Service (Docker).
- QR Code: ZXing.

> Đây là project mới theo cấu trúc PostgreSQL/Neon. Không chạy file SQL PostgreSQL trong SQL Server Management Studio. Chạy trong Neon SQL Editor.

## 1. Chức năng có trong source

### Customer
- Mở website từ URL QR có `token`.
- Website xác thực QRToken và hiển thị đúng bàn.
- Xem danh mục Snacks và Đồ uống.
- Chọn size/variant, topping đang được Admin bật bán.
- Thêm/xóa/tăng/giảm món trong giỏ hàng.
- Gửi đơn; Backend tính lại giá từ Database, sinh OrderCode và lưu Order/Table/OrderItems/Toppings trong một transaction.

### Manager/Admin
- Đăng nhập bằng tài khoản Manager được tạo tự động lúc ứng dụng khởi động.
- Xem 10 bàn, chọn bàn và xem/tải/in QR PNG riêng.
- Tạo tài khoản Staff.
- Thêm sản phẩm và giá vào danh mục Snacks hoặc Đồ uống.
- Bật/tắt sản phẩm, cập nhật giá size/variant.
- Cập nhật giá và trạng thái bán của topping.

### Staff
- Đăng nhập bằng tài khoản do Manager tạo.
- Xem danh sách đơn, bàn, OrderCode, ghi chú, món, size, topping và tổng tiền.
- Chuyển trạng thái theo quy trình: NEW → CONFIRMED → PREPARING → READY → COMPLETED (hoặc CANCELLED ở các bước cho phép).

## 2. Menu đã thống nhất

### Snacks
Danh mục Snacks được tạo sẵn. Vì chưa có danh sách tên và giá cụ thể từng món Snacks, Admin thêm từng món thực tế trong Admin Dashboard. Không tự đặt giá.

### Đồ uống
Seed sẵn các món (Trà lựu chỉ xuất hiện một lần vì danh sách ban đầu lặp tên):
- Trà lựu
- Trà đào
- Trà sữa
- Trà sữa Thái xanh
- Bạc xỉu
- Cà phê sữa đá
- Cà phê đen đá
- Trà mãng cầu
- Trà nhiệt đới
- Trà đá me
- Trà tắc
- Trà sữa ô long trứng nướng
- Trà sữa truyền thống
- Trà sữa dừa nướng
- Cà phê muối
- Trà ổi hồng
- Trà dâu tằm
- Sữa chua đá bào
- Sữa bắp
- Sữa đậu nành

Tất cả đồ uống được tạo size M = 45.000 VNĐ và L = 55.000 VNĐ theo thông tin menu đã cung cấp.

Topping tạo sẵn: Trân châu đen, Trân châu trắng, Pudding, Phô mai, Thạch sương sáo, Kem trứng. Giá topping chưa được cung cấp nên mặc định 0 và chưa bật bán. Admin phải xác nhận giá/phụ thu (hoặc xác nhận miễn phí) rồi bật bán trước khi khách có thể chọn.

## 3. Yêu cầu trên máy tính

- Java JDK 17 hoặc cao hơn.
- Maven 3.6.3 hoặc cao hơn (hoặc mở project bằng IntelliJ IDEA và dùng Maven tích hợp).
- Tài khoản Neon.
- Tài khoản GitHub và Render nếu muốn deploy Public.

Spring Boot 3.5.16 yêu cầu tối thiểu Java 17. Tài liệu chính thức: https://docs.spring.io/spring-boot/3.5/system-requirements.html

## 4. Tạo Database Neon

1. Mở https://neon.tech/ và đăng nhập.
2. Tạo Project tên `Cafe-QR-Ordering`.
3. Tạo/chọn database, ví dụ `cafeorder`.
4. Mở SQL Editor của database.
5. Mở file `database/01_schema.sql` trong source, copy toàn bộ và chạy một lần.
6. Sau khi schema tạo thành công, mở `database/02_seed_data.sql`, copy toàn bộ và chạy.
7. Chạy kiểm tra:

```sql
SELECT table_code, qr_token FROM cafe_tables ORDER BY table_number;
SELECT category_name FROM menu_categories ORDER BY category_id;
SELECT item_name FROM menu_items ORDER BY item_name;
SELECT item_name, variant_name, price
FROM menu_items mi
JOIN menu_item_variants v ON v.item_id = mi.item_id
ORDER BY item_name, variant_name;
```

Kết quả ban đầu cần có 10 bàn, 2 danh mục (Snacks, Đồ uống), 20 đồ uống và size M/L. Danh mục Snacks ban đầu rỗng cho tới khi Admin thêm món thật.

### Lấy thông tin Neon

1. Trong Neon Console nhấn `Connect`.
2. Chọn branch, database, role.
3. Bật Connection pooling để lấy hostname có `-pooler` cho ứng dụng web.
4. Sao chép thông tin host/database/username/password.
5. JDBC URL có dạng:

```text
jdbc:postgresql://YOUR-POOLER-HOST/YOUR_DATABASE?sslmode=require
```

Ví dụ trên chỉ là mẫu. Dùng host và database thật trong Neon, không tự sửa hostname. Không gửi password lên GitHub.

Neon dùng PostgreSQL và bắt buộc SSL/TLS. Tài liệu: https://neon.com/docs/connect/connect-from-any-app và https://neon.com/docs/connect/connection-pooling

## 5. Chạy Local lần đầu

### Cách A – PowerShell (Windows)

Mở PowerShell tại thư mục chứa `pom.xml`, đặt biến môi trường (thay bằng thông tin Neon thật):

```powershell
$env:SPRING_DATASOURCE_URL="jdbc:postgresql://YOUR-POOLER-HOST/YOUR_DATABASE?sslmode=require"
$env:SPRING_DATASOURCE_USERNAME="YOUR_NEON_ROLE"
$env:SPRING_DATASOURCE_PASSWORD="YOUR_NEON_PASSWORD"
$env:APP_ADMIN_USERNAME="admin"
$env:APP_ADMIN_PASSWORD="ChangeThisToA_Strong_Password_123!"
$env:APP_PUBLIC_BASE_URL="http://localhost:8080"
$env:SESSION_COOKIE_SECURE="false"
mvn spring-boot:run
```

### Cách B – IntelliJ IDEA

1. Mở folder project (folder có `pom.xml`).
2. Chờ IntelliJ tải Maven dependencies.
3. Mở Run → Edit Configurations → chọn cấu hình `CafeQrOrderingApplication`.
4. Trong Environment variables, thêm các biến giống PowerShell ở trên.
5. Run `CafeQrOrderingApplication`.

### Đăng nhập local

Mở `http://localhost:8080/login.html`.
- Username: giá trị `APP_ADMIN_USERNAME` (ví dụ `admin`).
- Password: giá trị `APP_ADMIN_PASSWORD` mà bạn vừa đặt.

Ứng dụng yêu cầu bạn tự cấu hình tài khoản Manager bằng biến môi trường và mật khẩu tối thiểu 12 ký tự; source không chứa mật khẩu mặc định để tránh vô tình public tài khoản yếu.

## 6. Cấu hình menu trước khi demo

1. Đăng nhập Admin.
2. Mục `Thêm món mới`: chọn Snacks, nhập tên món và giá thật; lựa chọn thường dùng là `Phần`.
3. Có thể cập nhật giá size M/L của đồ uống trong `Quản lý món và giá`.
4. Mục `Quản lý topping`: nhập phụ thu thực tế, tick `Đang bán`, nhấn Lưu.
5. Kiểm tra trang Customer đã hiển thị đúng menu.

Không tự giả định giá Snacks hoặc topping; hãy nhập giá do quán xác nhận.

## 7. Kiểm tra Local

- Customer: `http://localhost:8080/?token=...` (token thật lấy từ `cafe_tables.qr_token`, hoặc tải QR từ Admin).
- Login: `http://localhost:8080/login.html`.
- Admin: `http://localhost:8080/admin.html`.
- Staff: `http://localhost:8080/staff.html`.
- Health: `http://localhost:8080/api/health`.

Tạo tài khoản Staff từ Admin trước khi đăng nhập trang Staff.

## 8. Đưa Source Code lên GitHub

1. Tạo repository `Cafe-QR-Ordering-Website`.
2. Giữ repository Private khi nhóm đang phát triển.
3. Upload toàn bộ source folder.
4. Không upload password Neon, `.env`, key hoặc mật khẩu Admin thật.
5. `.gitignore` đã loại trừ `.env`, `target/`, `.idea/`.

Git commands:

```bash
git init
git add .
git commit -m "Initial Cafe QR Ordering Website"
git branch -M main
git remote add origin YOUR_GITHUB_REPOSITORY_URL
git push -u origin main
```

## 9. Deploy Public lên Render

1. Mở https://render.com/ và đăng nhập.
2. Chọn New → Web Service.
3. Kết nối GitHub repository.
4. Chọn repository `Cafe-QR-Ordering-Website`.
5. Chọn Runtime `Docker` (project có Dockerfile ở thư mục gốc).
6. Chọn gói phù hợp. Gói Free có thể sleep/cold start, không phù hợp dịch vụ thật cần luôn sẵn sàng.
7. Trong Environment, thêm:

| Key | Value |
|---|---|
| `SPRING_DATASOURCE_URL` | JDBC URL Neon pooled, có `sslmode=require` |
| `SPRING_DATASOURCE_USERNAME` | Role/user Neon |
| `SPRING_DATASOURCE_PASSWORD` | Password Neon |
| `APP_ADMIN_USERNAME` | Username Manager ban đầu |
| `APP_ADMIN_PASSWORD` | Mật khẩu mạnh, tối thiểu 12 ký tự |
| `APP_PUBLIC_BASE_URL` | URL Render của website, ví dụ `https://ten-service.onrender.com` |
| `SESSION_COOKIE_SECURE` | `true` |

Render tự đặt biến `PORT`; Dockerfile/ứng dụng lắng nghe trên `0.0.0.0:$PORT`.

8. Deploy. Khi Render cấp URL `https://...onrender.com`, đặt đúng URL đó vào `APP_PUBLIC_BASE_URL` rồi deploy lại.
9. Mở `https://...onrender.com/api/health`. Kết quả mong muốn: `status=UP`, `database=CONNECTED`.

Tài liệu Render: https://render.com/docs/web-services và https://render.com/docs/deploying-with-docker

## 10. Tạo QR Public và kiểm tra bằng điện thoại

1. Đăng nhập Admin qua URL Render.
2. Chọn BAN01, tải QR PNG; làm lần lượt BAN02–BAN10.
3. QR được sinh từ `APP_PUBLIC_BASE_URL` và UUID token trong Database.
4. In đúng QR và dán đúng bàn.
5. Dùng điện thoại khác, tắt Wi-Fi và dùng 4G/5G để quét thử.
6. Kiểm tra bàn được nhận diện chính xác, đặt thử một đơn, sau đó đăng nhập Staff để xác nhận đơn.

Nếu trước đó đã in QR bằng localhost, phải tải/in lại sau khi cấu hình Public URL.

## 11. API chính

| Method | Endpoint | Quyền |
|---|---|---|
| POST | `/api/auth/login` | Public |
| GET | `/api/auth/me` | Session |
| POST | `/api/auth/logout` | Session |
| GET | `/api/public/menu?token=UUID` | Public + QR hợp lệ |
| GET | `/api/public/tables/resolve?token=UUID` | Public |
| POST | `/api/public/orders` | Public + QR hợp lệ |
| GET | `/api/admin/tables` | Manager |
| GET | `/api/admin/tables/{id}/qr.png` | Manager |
| POST | `/api/admin/staff` | Manager |
| GET | `/api/admin/menu` | Manager |
| POST | `/api/admin/menu-items` | Manager |
| PUT | `/api/admin/menu-items/{id}` | Manager |
| PUT | `/api/admin/items/{id}/availability` | Manager |
| PUT | `/api/admin/variants/{id}` | Manager |
| GET | `/api/admin/toppings` | Manager |
| PUT | `/api/admin/toppings/{id}` | Manager |
| GET | `/api/staff/orders` | Staff/Manager |
| PATCH | `/api/staff/orders/{id}/status` | Staff/Manager |
| GET | `/api/health` | Public health check |

## 12. Lưu ý vận hành và bảo mật

- Neon Free compute có thể scale-to-zero sau thời gian không hoạt động; request đầu tiên sau khi ngủ có thể chậm.
- Render Free Web Service tự sleep sau 15 phút không nhận traffic; lần truy cập tiếp theo có cold start. Mở và kiểm tra website trước giờ demo.
- Render filesystem mặc định ephemeral; project không lưu dữ liệu đơn hàng lên ổ đĩa local mà lưu trên Neon.
- Không mở PostgreSQL trực tiếp cho thiết bị Customer. Chỉ Backend kết nối Database.
- Dùng mật khẩu mạnh cho Admin; không dùng tài khoản demo mặc định trên Public.
- Website hiện dùng Session Cookie, HttpOnly và SameSite=Lax. Trước khi triển khai phục vụ khách thật cần đánh giá bảo mật sâu hơn, bổ sung CSRF protection/rate limit/monitoring và quy trình backup phù hợp.
- Đây là project cho bài tập/demo; chưa phải hệ thống thương mại đã được kiểm thử tải và kiểm toán bảo mật.

## 13. Lỗi thường gặp

**Build lỗi Java:** kiểm tra JDK 17, Maven và version trong `pom.xml`.

**Không kết nối Neon:** kiểm tra JDBC URL, hostname có `-pooler`, username/password và `sslmode=require`.

**Báo relation/table not found:** chạy `01_schema.sql` trước, sau đó `02_seed_data.sql`.

**Menu không có Snacks:** đây là chủ ý vì chưa có tên/giá từng món. Admin thêm món Snacks và giá.

**Topping không hiện cho khách:** topping mặc định chưa bán; Admin cần nhập giá và bật trạng thái.

**Render deploy lỗi port:** kiểm tra Dockerfile và log; service phải bind `0.0.0.0` và biến `PORT`.

**QR mở localhost:** cập nhật `APP_PUBLIC_BASE_URL` bằng URL Render, deploy lại và tải/in QR mới.
