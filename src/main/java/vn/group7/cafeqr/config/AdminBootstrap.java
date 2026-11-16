package vn.group7.cafeqr.config;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;

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

                    // Tự động liên kết các món Đồ uống với toàn bộ Topping đang có (loại trừ đồ ăn / snacks)
                    try {
                        jdbc.update(
                                """
                                INSERT INTO menu_item_toppings(item_id, topping_id)
                                SELECT mi.item_id, t.topping_id
                                FROM menu_items mi
                                JOIN menu_categories c ON c.category_id = mi.category_id
                                CROSS JOIN toppings t
                                WHERE LOWER(c.category_name) NOT IN ('snacks', 'food', 'foods', 'món ăn', 'đồ ăn')
                                ON CONFLICT DO NOTHING
                                """);
                        jdbc.update(
                                """
                                DELETE FROM menu_item_toppings mit
                                USING menu_items mi, menu_categories c
                                WHERE mit.item_id = mi.item_id AND mi.category_id = c.category_id
                                  AND LOWER(c.category_name) IN ('snacks', 'food', 'foods', 'món ăn', 'đồ ăn')
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
