package vn.group7.cafeqr.controller;

import vn.group7.cafeqr.security.SessionGuard;
import jakarta.servlet.http.HttpSession;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

import java.util.*;

@RestController
@RequestMapping("/api/staff/orders")
public class StaffController {
    private final JdbcTemplate jdbc;

    public StaffController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record StatusRequest(@NotBlank String status) {}

    @GetMapping
    public List<Map<String, Object>> getOrders(HttpSession session) {
        SessionGuard.requireRole(session, "STAFF", "MANAGER");
        List<Map<String, Object>> orders = jdbc.queryForList(
                """
                SELECT o.order_id AS \"orderId\", o.order_code AS \"orderCode\", t.table_number AS \"tableNumber\",
                       o.total_amount AS \"totalAmount\", o.status, o.customer_note AS \"customerNote\",
                       o.created_at AS \"createdAt\", o.updated_at AS \"updatedAt\"
                FROM customer_orders o JOIN cafe_tables t ON t.table_id = o.table_id
                ORDER BY o.created_at DESC LIMIT 100
                """);
        for (Map<String, Object> order : orders) {
            long orderId = ((Number) order.get("orderId")).longValue();
            List<Map<String, Object>> items = jdbc.queryForList(
                    """
                    SELECT order_item_id AS \"orderItemId\", item_name_snapshot AS \"itemName\",
                           variant_name_snapshot AS \"variantName\", base_unit_price AS \"baseUnitPrice\",
                           topping_unit_total AS \"toppingUnitTotal\", quantity, line_total AS \"lineTotal\"
                    FROM order_items WHERE order_id = ? ORDER BY order_item_id
                    """, orderId);
            for (Map<String, Object> item : items) {
                long orderItemId = ((Number) item.get("orderItemId")).longValue();
                item.put("toppings", jdbc.queryForList(
                        "SELECT topping_name_snapshot AS \"toppingName\", additional_price AS \"additionalPrice\" FROM order_item_toppings WHERE order_item_id = ?",
                        orderItemId));
            }
            order.put("items", items);
        }
        return orders;
    }

    @PatchMapping("/{orderId}/status")
    @Transactional
    public Map<String, Object> updateStatus(@PathVariable long orderId,
                                            @Valid @RequestBody StatusRequest request,
                                            HttpSession session) {
        long staffId = SessionGuard.requireRole(session, "STAFF", "MANAGER");
        String next = request.status().trim().toUpperCase(Locale.ROOT);
        Set<String> allowed = Set.of("CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED");
        if (!allowed.contains(next)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Trạng thái mới không hợp lệ.");
        }

        String current;
        try {
            current = jdbc.queryForObject(
                    "SELECT status FROM customer_orders WHERE order_id = ? FOR UPDATE",
                    String.class, orderId);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy đơn hàng.");
        }

        Map<String, Set<String>> transitions = Map.of(
                "NEW", Set.of("CONFIRMED", "PREPARING", "READY", "COMPLETED", "CANCELLED"),
                "CONFIRMED", Set.of("PREPARING", "READY", "COMPLETED", "CANCELLED"),
                "PREPARING", Set.of("READY", "COMPLETED", "CANCELLED"),
                "READY", Set.of("COMPLETED", "CANCELLED"),
                "COMPLETED", Set.of(),
                "CANCELLED", Set.of());
        if (!transitions.getOrDefault(current, Set.of()).contains(next)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Không thể chuyển trạng thái từ " + current + " sang " + next + ".");
        }
        jdbc.update(
                "UPDATE customer_orders SET status = ?, staff_id = ?, updated_at = CURRENT_TIMESTAMP WHERE order_id = ?",
                next, staffId, orderId);
        return Map.of("success", true, "message", "Đã cập nhật trạng thái.", "status", next);
    }

    @GetMapping("/history")
    public Map<String, Object> getHistory(
            @RequestParam(required = false) String date,
            HttpSession session) {
        SessionGuard.requireRole(session, "STAFF", "MANAGER");
        String queryDate = (date != null && !date.isBlank()) ? date.trim() : java.time.LocalDate.now().toString();

        List<Map<String, Object>> orders = jdbc.queryForList(
                """
                SELECT o.order_id AS \"orderId\", o.order_code AS \"orderCode\", t.table_number AS \"tableNumber\",
                       o.total_amount AS \"totalAmount\", o.status, o.customer_note AS \"customerNote\",
                       o.created_at AS \"createdAt\", o.updated_at AS \"updatedAt\"
                FROM customer_orders o
                JOIN cafe_tables t ON t.table_id = o.table_id
                WHERE CAST(o.created_at AT TIME ZONE 'Asia/Ho_Chi_Minh' AS DATE) = CAST(? AS DATE)
                ORDER BY o.created_at ASC
                """, queryDate);

        long totalOrders = orders.size();
        long completedOrders = 0;
        java.math.BigDecimal totalRevenue = java.math.BigDecimal.ZERO;

        for (Map<String, Object> order : orders) {
            long orderId = ((Number) order.get("orderId")).longValue();
            String status = (String) order.get("status");
            if ("COMPLETED".equals(status)) {
                completedOrders++;
                java.math.BigDecimal amount = (java.math.BigDecimal) order.get("totalAmount");
                if (amount != null) {
                    totalRevenue = totalRevenue.add(amount);
                }
            }

            List<Map<String, Object>> items = jdbc.queryForList(
                    """
                    SELECT order_item_id AS \"orderItemId\", item_name_snapshot AS \"itemName\",
                           variant_name_snapshot AS \"variantName\", base_unit_price AS \"baseUnitPrice\",
                           topping_unit_total AS \"toppingUnitTotal\", quantity, line_total AS \"lineTotal\"
                    FROM order_items WHERE order_id = ? ORDER BY order_item_id
                    """, orderId);
            for (Map<String, Object> item : items) {
                long orderItemId = ((Number) item.get("orderItemId")).longValue();
                item.put("toppings", jdbc.queryForList(
                        "SELECT topping_name_snapshot AS \"toppingName\", additional_price AS \"additionalPrice\" FROM order_item_toppings WHERE order_item_id = ?",
                        orderItemId));
            }
            order.put("items", items);
        }

        return Map.of(
                "date", queryDate,
                "totalOrders", totalOrders,
                "completedOrders", completedOrders,
                "totalRevenue", totalRevenue,
                "orders", orders
        );
    }

    @GetMapping("/detail")
    public Map<String, Object> getOrderDetail(@RequestParam(required = false) Long orderId,
                                              @RequestParam(required = false) String orderCode,
                                              HttpSession session) {
        SessionGuard.requireRole(session, "STAFF", "MANAGER");
        if (orderId == null && (orderCode == null || orderCode.isBlank())) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "Thiếu orderId hoặc orderCode.");
        }

        String sql = """
                SELECT o.order_id AS "orderId", o.order_code AS "orderCode",
                       t.table_number AS "tableNumber", t.table_code AS "tableCode",
                       o.total_amount AS "totalAmount", o.status, o.customer_note AS "customerNote",
                       o.created_at AS "createdAt", o.updated_at AS "updatedAt",
                       u.full_name AS "staffName", u.username AS "staffUsername"
                FROM customer_orders o
                JOIN cafe_tables t ON t.table_id = o.table_id
                LEFT JOIN users u ON u.user_id = o.staff_id
                WHERE """ + (orderId != null ? "o.order_id = ?" : "UPPER(TRIM(o.order_code)) = UPPER(TRIM(?))");

        Object param = orderId != null ? orderId : orderCode.trim();

        List<Map<String, Object>> list = jdbc.queryForList(sql, param);
        if (list.isEmpty()) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "Không tìm thấy đơn hàng.");
        }
        Map<String, Object> order = new LinkedHashMap<>(list.get(0));

        Object idVal = order.get("orderId") != null ? order.get("orderId") : order.get("orderid");
        if (idVal == null) idVal = order.get("order_id");
        long id = ((Number) idVal).longValue();

        List<Map<String, Object>> items = jdbc.queryForList("""
                SELECT order_item_id AS "orderItemId", item_name_snapshot AS "itemName",
                       variant_name_snapshot AS "variantName", base_unit_price AS "baseUnitPrice",
                       topping_unit_total AS "toppingUnitTotal", quantity, line_total AS "lineTotal"
                FROM order_items WHERE order_id = ? ORDER BY order_item_id
                """, id);

        for (Map<String, Object> item : items) {
            Object itemIdVal = item.get("orderItemId") != null ? item.get("orderItemId") : item.get("orderitemid");
            if (itemIdVal == null) itemIdVal = item.get("order_item_id");
            long orderItemId = ((Number) itemIdVal).longValue();

            item.put("toppings", jdbc.queryForList("""
                    SELECT topping_name_snapshot AS "toppingName", additional_price AS "additionalPrice"
                    FROM order_item_toppings WHERE order_item_id = ?
                    """, orderItemId));
        }

        order.put("items", items);
        return order;
    }
}
