package vn.group7.cafeqr.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

import java.util.List;

@Configuration
public class AdminBootstrap {

    @Bean
    CommandLineRunner createInitialManager(
            JdbcTemplate jdbc,
            PasswordEncoder encoder,
            @Value("${app.admin.username}") String username,
            @Value("${app.admin.password}") String password) {

        return args -> {
            if (username == null || username.isBlank()) {
                throw new IllegalStateException("Cần cấu hình APP_ADMIN_USERNAME trước khi chạy ứng dụng.");
            }
            if (password == null || password.length() < 12) {
                throw new IllegalStateException("Cần cấu hình APP_ADMIN_PASSWORD có ít nhất 12 ký tự trước khi chạy ứng dụng.");
            }

            // Retry loop để phòng trường hợp Neon Serverless DB đang ngủ hoặc kết nối chậm
            int maxAttempts = 4;
            for (int attempt = 1; attempt <= maxAttempts; attempt++) {
                try {
                    Long count = jdbc.queryForObject(
                            "SELECT COUNT(*) FROM users WHERE username = ?",
                            Long.class,
                            username);

                    if (count == null || count == 0) {
                        jdbc.update(
                                "INSERT INTO users(username, password_hash, full_name, role, is_active) VALUES (?, ?, ?, 'MANAGER', TRUE)",
                                username,
                                encoder.encode(password),
                                "Quản trị viên");
                        System.out.println("Initial Manager account created: " + username);
                    } else {
                        jdbc.update(
                                "UPDATE users SET password_hash = ?, is_active = TRUE, role = 'MANAGER' WHERE username = ?",
                                encoder.encode(password),
                                username);
                        System.out.println("Manager account synchronized with app.admin.password: " + username);
                    }

                    // =========================================================
                    // CHUẨN HÓA & ĐỒNG BỘ DANH MỤC GIỮA ADMIN VÀ TRANG KHÁCH HÀNG
                    // =========================================================
                    try {
                        // 1. Đảm bảo 5 danh mục chuẩn luôn tồn tại
                        String[] standardCats = {"Cà phê", "Trà sữa", "Trà trái cây", "Khác", "Snacks"};
                        for (String cat : standardCats) {
                            Long c = jdbc.queryForObject(
                                    "SELECT COUNT(*) FROM menu_categories WHERE LOWER(TRIM(category_name)) = LOWER(TRIM(?))",
                                    Long.class, cat);
                            if (c == null || c == 0) {
                                jdbc.update("INSERT INTO menu_categories(category_name) VALUES (?)", cat);
                            }
                        }

                        // Lấy ID các danh mục chuẩn
                        Long idCaPhe = jdbc.queryForObject("SELECT category_id FROM menu_categories WHERE LOWER(TRIM(category_name)) = 'cà phê' ORDER BY category_id LIMIT 1", Long.class);
                        Long idTraSua = jdbc.queryForObject("SELECT category_id FROM menu_categories WHERE LOWER(TRIM(category_name)) = 'trà sữa' ORDER BY category_id LIMIT 1", Long.class);
                        Long idTraTraiCay = jdbc.queryForObject("SELECT category_id FROM menu_categories WHERE LOWER(TRIM(category_name)) = 'trà trái cây' ORDER BY category_id LIMIT 1", Long.class);
                        Long idKhac = jdbc.queryForObject("SELECT category_id FROM menu_categories WHERE LOWER(TRIM(category_name)) = 'khác' ORDER BY category_id LIMIT 1", Long.class);

                        // 2. Chuyển món từ "Sữa & Khác" sang "Khác" và xóa "Sữa & Khác"
                        List<Long> suaKhacIds = jdbc.queryForList(
                                "SELECT category_id FROM menu_categories WHERE LOWER(TRIM(category_name)) IN ('sữa & khác', 'sữa và khác')",
                                Long.class);
                        for (Long skId : suaKhacIds) {
                            if (idKhac != null) {
                                jdbc.update("UPDATE menu_items SET category_id = ? WHERE category_id = ?", idKhac, skId);
                            }
                            jdbc.update("DELETE FROM menu_categories WHERE category_id = ?", skId);
                        }

                        // 3. Phân loại các món đang thuộc danh mục cũ "Đồ uống" (nếu có)
                        List<Long> doUongIds = jdbc.queryForList(
                                "SELECT category_id FROM menu_categories WHERE LOWER(TRIM(category_name)) = 'đồ uống'",
                                Long.class);
                        for (Long duId : doUongIds) {
                            if (idCaPhe != null) {
                                jdbc.update("UPDATE menu_items SET category_id = ? WHERE category_id = ? AND (LOWER(item_name) LIKE '%cà phê%' OR LOWER(item_name) LIKE '%bạc xỉu%')", idCaPhe, duId);
                            }
                            if (idTraSua != null) {
                                jdbc.update("UPDATE menu_items SET category_id = ? WHERE category_id = ? AND LOWER(item_name) LIKE '%trà sữa%'", idTraSua, duId);
                            }
                            if (idTraTraiCay != null) {
                                jdbc.update("UPDATE menu_items SET category_id = ? WHERE category_id = ? AND LOWER(item_name) LIKE '%trà %' AND LOWER(item_name) NOT LIKE '%trà sữa%'", idTraTraiCay, duId);
                            }
                            if (idKhac != null) {
                                jdbc.update("UPDATE menu_items SET category_id = ? WHERE category_id = ?", idKhac, duId);
                            }
                            jdbc.update("DELETE FROM menu_categories WHERE category_id = ?", duId);
                        }

                        // 4. Dọn dẹp danh mục rỗng "Đồ ăn" (nếu chưa có món nào)
                        jdbc.update("DELETE FROM menu_categories WHERE LOWER(TRIM(category_name)) = 'đồ ăn' AND NOT EXISTS (SELECT 1 FROM menu_items WHERE category_id = menu_categories.category_id)");

                    } catch (Exception e) {
                        System.err.println("Ghi chú: Lỗi khi đồng bộ danh mục: " + e.getMessage());
                    }

                    // Tự động liên kết các món Đồ uống với toàn bộ Topping đang có (loại trừ đồ ăn / snacks)
                    try {
                        jdbc.update(
                                """
                                INSERT INTO menu_item_toppings(item_id, topping_id)
                                SELECT mi.item_id, t.topping_id
                                FROM menu_items mi
                                JOIN menu_categories c ON c.category_id = mi.category_id
                                CROSS JOIN toppings t
                                WHERE LOWER(c.category_name) NOT IN ('snacks', 'food', 'foods', 'món ăn', 'đồ ăn', 'bánh', 'bánh ngọt')
                                ON CONFLICT DO NOTHING
                                """);
                        jdbc.update(
                                """
                                DELETE FROM menu_item_toppings mit
                                USING menu_items mi, menu_categories c
                                WHERE mit.item_id = mi.item_id AND mi.category_id = c.category_id
                                  AND LOWER(c.category_name) IN ('snacks', 'food', 'foods', 'món ăn', 'đồ ăn', 'bánh', 'bánh ngọt')
                                """);
                    } catch (Exception e) {
                        System.err.println("Ghi chú: Chưa thể cập nhật menu_item_toppings lúc khởi động: " + e.getMessage());
                    }

                    // Kích hoạt bán cho các topping có sẵn nếu chưa bật
                    try {
                        jdbc.update("UPDATE toppings SET is_available = TRUE WHERE is_available IS NULL OR (additional_price > 0 AND is_available = FALSE)");
                    } catch (Exception e) {
                        System.err.println("Ghi chú: Không thể cập nhật trạng thái topping: " + e.getMessage());
                    }

                    break;
                } catch (Exception ex) {
                    System.err.println("Thử kết nối database lần " + attempt + "/" + maxAttempts + " thất bại: " + ex.getMessage());
                    if (attempt < maxAttempts) {
                        try {
                            Thread.sleep(3000);
                        } catch (InterruptedException ignored) {}
                    } else {
                        System.err.println("Cảnh báo: Không thể kết nối Database Neon lúc khởi động. Ứng dụng vẫn tiếp tục chạy.");
                    }
                }
            }
        };
    }
}
