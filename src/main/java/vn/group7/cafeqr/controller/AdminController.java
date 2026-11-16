package vn.group7.cafeqr.controller;

import vn.group7.cafeqr.security.SessionGuard;
import vn.group7.cafeqr.service.QrCodeService;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.web.bind.annotation.*;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.*;

@RestController
@RequestMapping("/api/admin")
public class AdminController {
    private final JdbcTemplate jdbc;
    private final QrCodeService qrCodeService;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.public-base-url}")
    private String publicBaseUrl;

    public AdminController(JdbcTemplate jdbc, QrCodeService qrCodeService, PasswordEncoder passwordEncoder) {
        this.jdbc = jdbc;
        this.qrCodeService = qrCodeService;
        this.passwordEncoder = passwordEncoder;
    }

    public record StaffRequest(@NotBlank String username, @NotBlank String password, @NotBlank String fullName) {}
    public record MenuItemRequest(@NotNull Long categoryId, @NotBlank String itemName,
                                  String description, @NotBlank String variantName,
                                  @NotNull BigDecimal price, Boolean available) {}
    public record VariantUpdateRequest(@NotNull BigDecimal price, @NotNull Boolean available) {}
    public record ToppingUpdateRequest(@NotNull BigDecimal additionalPrice, @NotNull Boolean available) {}
    public record CreateToppingRequest(@NotBlank String toppingName, @NotNull BigDecimal additionalPrice, Boolean available) {}
    public record AvailabilityRequest(@NotNull Boolean available) {}
    public record MenuItemUpdateRequest(@NotBlank String itemName, String description) {}

    @GetMapping("/tables")
    public List<Map<String, Object>> getTables(HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        return jdbc.queryForList(
                "SELECT table_id AS \"tableId\", table_number AS \"tableNumber\", table_code AS \"tableCode\", is_active AS \"isActive\" FROM cafe_tables ORDER BY table_number");
    }

    @GetMapping(value = "/tables/{tableId}/qr.png", produces = MediaType.IMAGE_PNG_VALUE)
    public ResponseEntity<byte[]> getQr(@PathVariable long tableId,
                                        @RequestParam(defaultValue = "false") boolean download,
                                        HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        Map<String, Object> table;
        try {
            table = jdbc.queryForMap("SELECT table_code, qr_token FROM cafe_tables WHERE table_id = ? AND is_active = TRUE", tableId);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bàn.");
        }
        String base = publicBaseUrl.replaceAll("/+$", "");
        String token = String.valueOf(table.get("qr_token"));
        String url = base + "/?token=" + URLEncoder.encode(token, StandardCharsets.UTF_8);
        byte[] image = qrCodeService.generatePng(url);
        String disposition = (download ? "attachment" : "inline") + "; filename=\"" + table.get("table_code") + ".png\"";
        return ResponseEntity.ok()
                .contentType(MediaType.IMAGE_PNG)
                .header(HttpHeaders.CONTENT_DISPOSITION, disposition)
                .header(HttpHeaders.CACHE_CONTROL, "no-store")
                .body(image);
    }

    @PostMapping("/staff")
    public Map<String, Object> createStaff(@Valid @RequestBody StaffRequest request, HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        if (request.password().length() < 8) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mật khẩu Staff phải có ít nhất 8 ký tự.");
        }
        try {
            jdbc.update(
                    "INSERT INTO users(username, password_hash, full_name, role) VALUES (?, ?, ?, 'STAFF')",
                    request.username().trim(), passwordEncoder.encode(request.password()), request.fullName().trim());
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tên đăng nhập đã tồn tại.");
        }
        return Map.of("success", true, "message", "Tạo tài khoản Staff thành công.");
    }

    @GetMapping("/staff")
    public List<Map<String, Object>> getStaffList(HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        return jdbc.queryForList(
                "SELECT user_id AS \"userId\", username, full_name AS \"fullName\", role, is_active AS \"isActive\", created_at AS \"createdAt\" FROM users ORDER BY user_id DESC");
    }

    @PutMapping("/staff/{userId}/status")
    public Map<String, Object> toggleStaffStatus(@PathVariable long userId, @RequestBody Map<String, Boolean> body, HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        boolean isActive = body.getOrDefault("isActive", true);
        jdbc.update("UPDATE users SET is_active = ? WHERE user_id = ?", isActive, userId);
        return Map.of("success", true, "message", "Đã cập nhật trạng thái tài khoản.");
    }

    @GetMapping("/categories")
    public List<Map<String, Object>> getCategories(HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        return jdbc.queryForList("SELECT category_id AS \"categoryId\", category_name AS \"categoryName\" FROM menu_categories ORDER BY category_id");
    }

    @GetMapping("/menu")
    public List<Map<String, Object>> getMenu(HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        List<Map<String, Object>> categories = jdbc.queryForList(
                "SELECT category_id AS \"categoryId\", category_name AS \"categoryName\" FROM menu_categories ORDER BY category_id");
        for (Map<String, Object> category : categories) {
            long categoryId = ((Number) category.get("categoryId")).longValue();
            List<Map<String, Object>> items = jdbc.queryForList(
                    "SELECT item_id AS \"itemId\", item_name AS \"itemName\", COALESCE(description,'') AS description, is_available AS \"isAvailable\" FROM menu_items WHERE category_id = ? ORDER BY item_name",
                    categoryId);
            for (Map<String, Object> item : items) {
                long itemId = ((Number) item.get("itemId")).longValue();
                item.put("variants", jdbc.queryForList(
                        "SELECT variant_id AS \"variantId\", variant_name AS \"variantName\", price, is_available AS \"isAvailable\" FROM menu_item_variants WHERE item_id = ? ORDER BY variant_id",
                        itemId));
                item.put("toppings", jdbc.queryForList(
                        """
                        SELECT t.topping_id AS \"toppingId\", t.topping_name AS \"toppingName\", t.additional_price AS \"additionalPrice\", t.is_available AS \"isAvailable\"
                        FROM toppings t JOIN menu_item_toppings mit ON mit.topping_id = t.topping_id
                        WHERE mit.item_id = ? ORDER BY t.topping_name
                        """, itemId));
            }
            category.put("items", items);
        }
        return categories;
    }

    @PostMapping("/menu-items")
    @Transactional
    public Map<String, Object> createMenuItem(@Valid @RequestBody MenuItemRequest request, HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        if (request.price().compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Giá không được âm.");
        }
        Long categoryExists = jdbc.queryForObject(
                "SELECT COUNT(*) FROM menu_categories WHERE category_id = ?", Long.class, request.categoryId());
        if (categoryExists == null || categoryExists == 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Danh mục không tồn tại.");
        }
        try {
            Long itemId = jdbc.queryForObject(
                    "INSERT INTO menu_items(category_id, item_name, description, is_available) VALUES (?, ?, ?, TRUE) RETURNING item_id",
                    Long.class, request.categoryId(), request.itemName().trim(), request.description());
            boolean available = request.available() != null ? request.available() : request.price().compareTo(BigDecimal.ZERO) > 0;
            if (available && request.price().compareTo(BigDecimal.ZERO) <= 0) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sản phẩm đang bán phải có giá lớn hơn 0.");
            }
            jdbc.update(
                    "INSERT INTO menu_item_variants(item_id, variant_name, price, is_available) VALUES (?, ?, ?, ?)",
                    itemId, request.variantName().trim(), request.price(), available);
            return Map.of("success", true, "itemId", itemId, "message", "Đã thêm sản phẩm và lựa chọn giá.");
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Sản phẩm hoặc lựa chọn này đã tồn tại trong danh mục.");
        }
    }

    @PutMapping("/menu-items/{itemId}")
    public Map<String, Object> updateMenuItem(@PathVariable long itemId,
                                               @Valid @RequestBody MenuItemUpdateRequest request,
                                               HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        try {
            int changed = jdbc.update(
                    "UPDATE menu_items SET item_name = ?, description = ? WHERE item_id = ?",
                    request.itemName().trim(), request.description(), itemId);
            if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy sản phẩm.");
            return Map.of("success", true, "message", "Đã cập nhật thông tin sản phẩm.");
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tên món đã tồn tại trong danh mục.");
        }
    }

    @PutMapping("/items/{itemId}/availability")
    public Map<String, Object> updateItemAvailability(@PathVariable long itemId,
                                                       @Valid @RequestBody AvailabilityRequest request,
                                                       HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        int changed = jdbc.update("UPDATE menu_items SET is_available = ? WHERE item_id = ?", request.available(), itemId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy sản phẩm.");
        return Map.of("success", true);
    }

    @PutMapping("/variants/{variantId}")
    public Map<String, Object> updateVariant(@PathVariable long variantId,
                                             @Valid @RequestBody VariantUpdateRequest request,
                                             HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        if (request.price().compareTo(BigDecimal.ZERO) < 0
                || (request.available() && request.price().compareTo(BigDecimal.ZERO) <= 0)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sản phẩm đang bán phải có giá lớn hơn 0.");
        }
        int changed = jdbc.update(
                "UPDATE menu_item_variants SET price = ?, is_available = ? WHERE variant_id = ?",
                request.price(), request.available(), variantId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy size/giá sản phẩm.");
        return Map.of("success", true, "message", "Đã cập nhật giá.");
    }

    @GetMapping("/toppings")
    public List<Map<String, Object>> getToppings(HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        return jdbc.queryForList(
                "SELECT topping_id AS \"toppingId\", topping_name AS \"toppingName\", additional_price AS \"additionalPrice\", is_available AS \"isAvailable\" FROM toppings ORDER BY topping_name");
    }

    @PutMapping("/toppings/{toppingId}")
    public Map<String, Object> updateTopping(@PathVariable long toppingId,
                                             @Valid @RequestBody ToppingUpdateRequest request,
                                             HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        if (request.additionalPrice().compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phụ thu topping không được âm.");
        }
        int changed = jdbc.update(
                "UPDATE toppings SET additional_price = ?, is_available = ? WHERE topping_id = ?",
                request.additionalPrice(), request.available(), toppingId);
        if (changed == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy topping.");
        return Map.of("success", true, "message", "Đã cập nhật topping.");
    }

    @PostMapping("/toppings")
    @Transactional
    public Map<String, Object> createTopping(@Valid @RequestBody CreateToppingRequest request, HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        if (request.additionalPrice().compareTo(BigDecimal.ZERO) < 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Phụ thu topping không được âm.");
        }
        try {
            boolean isAvailable = request.available() != null ? request.available() : true;
            Long toppingId = jdbc.queryForObject(
                    "INSERT INTO toppings(topping_name, additional_price, is_available) VALUES (?, ?, ?) RETURNING topping_id",
                    Long.class, request.toppingName().trim(), request.additionalPrice(), isAvailable);

            // Tự động liên kết topping mới với toàn bộ các món trong thực đơn
            jdbc.update(
                    """
                    INSERT INTO menu_item_toppings(item_id, topping_id)
                    SELECT mi.item_id, ?
                    FROM menu_items mi
                    ON CONFLICT DO NOTHING
                    """, toppingId);

            return Map.of("success", true, "toppingId", toppingId, "message", "Đã thêm topping mới thành công.");
        } catch (DataIntegrityViolationException ex) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Tên topping này đã tồn tại trong quán.");
        }
    }

    @DeleteMapping("/toppings/{toppingId}")
    public Map<String, Object> deleteTopping(@PathVariable long toppingId, HttpSession session) {
        SessionGuard.requireRole(session, "MANAGER");
        int deleted = jdbc.update("DELETE FROM toppings WHERE topping_id = ?", toppingId);
        if (deleted == 0) throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy topping.");
        return Map.of("success", true, "message", "Đã xóa topping thành công.");
    }
}
