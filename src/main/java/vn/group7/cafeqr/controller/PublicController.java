package vn.group7.cafeqr.controller;

import vn.group7.cafeqr.service.OrderService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
@RequestMapping("/api/public")
public class PublicController {
    private final JdbcTemplate jdbc;
    private final OrderService orderService;

    public PublicController(JdbcTemplate jdbc, OrderService orderService) {
        this.jdbc = jdbc;
        this.orderService = orderService;
    }

    @GetMapping("/tables/resolve")
    public Map<String, Object> resolveTable(@RequestParam String token) {
        UUID uuid = parseToken(token);
        try {
            return jdbc.queryForMap(
                    "SELECT table_id AS \"tableId\", table_number AS \"tableNumber\", table_code AS \"tableCode\" FROM cafe_tables WHERE qr_token = ? AND is_active = TRUE",
                    uuid);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "QR không hợp lệ hoặc bàn đang tạm ngưng.");
        }
    }

    @GetMapping("/menu")
    public Map<String, Object> getMenu(@RequestParam String token) {
        Map<String, Object> table = resolveTable(token);
        List<Map<String, Object>> categories = jdbc.queryForList("""
                SELECT category_id AS "categoryId", category_name AS "categoryName" 
                FROM menu_categories 
                ORDER BY 
                  CASE 
                    WHEN LOWER(category_name) = 'cà phê' THEN 1
                    WHEN LOWER(category_name) = 'trà sữa' THEN 2
                    WHEN LOWER(category_name) = 'trà trái cây' THEN 3
                    WHEN LOWER(category_name) = 'khác' THEN 4
                    WHEN LOWER(category_name) = 'snacks' THEN 5
                    ELSE 10 
                  END, 
                  category_id
                """);

        for (Map<String, Object> category : categories) {
            long categoryId = ((Number) category.get("categoryId")).longValue();
            List<Map<String, Object>> items = jdbc.queryForList(
                    """
                    SELECT mi.item_id AS "itemId", mi.item_name AS "itemName", COALESCE(mi.description, '') AS description, mi.image_url AS "imageUrl"
                    FROM menu_items mi
                    WHERE mi.category_id = ? AND mi.is_available = TRUE
                      AND EXISTS (SELECT 1 FROM menu_item_variants v WHERE v.item_id = mi.item_id AND v.is_available = TRUE AND v.price > 0)
                    ORDER BY mi.item_name
                    """, categoryId);

            for (Map<String, Object> item : items) {
                long itemId = ((Number) item.get("itemId")).longValue();
                item.put("variants", jdbc.queryForList(
                        "SELECT variant_id AS \"variantId\", variant_name AS \"variantName\", price FROM menu_item_variants WHERE item_id = ? AND is_available = TRUE AND price > 0 ORDER BY variant_id",
                        itemId));
                List<Map<String, Object>> toppings = Collections.emptyList();
                String catLower = (category.get("categoryName") != null) ? category.get("categoryName").toString().toLowerCase() : "";
                if (!catLower.equals("snacks") && !catLower.contains("snack") && !catLower.contains("food") && !catLower.contains("ăn") && !catLower.contains("bánh")) {
                    toppings = jdbc.queryForList(
                            """
                            SELECT t.topping_id AS \"toppingId\", t.topping_name AS \"toppingName\", t.additional_price AS \"additionalPrice\", t.is_available AS \"isAvailable\"
                            FROM toppings t JOIN menu_item_toppings mit ON mit.topping_id = t.topping_id
                            WHERE mit.item_id = ? AND t.is_available = TRUE ORDER BY t.topping_name
                            """, itemId);
                    if (toppings.isEmpty()) {
                        toppings = jdbc.queryForList(
                                """
                                SELECT t.topping_id AS \"toppingId\", t.topping_name AS \"toppingName\", t.additional_price AS \"additionalPrice\", t.is_available AS \"isAvailable\"
                                FROM toppings t WHERE t.is_available = TRUE ORDER BY t.topping_name
                                """);
                    }
                }
                item.put("toppings", toppings);
            }
            category.put("items", items);
        }

        return Map.of("table", table, "categories", categories);
    }

    @GetMapping("/toppings")
    public List<Map<String, Object>> getAvailableToppings() {
        return jdbc.queryForList(
                "SELECT topping_id AS \"toppingId\", topping_name AS \"toppingName\", additional_price AS \"additionalPrice\", is_available AS \"isAvailable\" FROM toppings WHERE is_available = TRUE ORDER BY topping_name");
    }

    @PostMapping("/orders")
    public Map<String, Object> createOrder(@Valid @RequestBody OrderService.CreateOrderRequest request) {
        return orderService.createOrder(request);
    }

    private UUID parseToken(String token) {
        try {
            return UUID.fromString(token);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "QRToken không đúng định dạng.");
        }
    }
}
