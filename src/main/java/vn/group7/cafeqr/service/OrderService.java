package vn.group7.cafeqr.service;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;

@Service
public class OrderService {
    private final JdbcTemplate jdbc;

    public OrderService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public record OrderItemRequest(Long variantId, Integer quantity, List<Long> toppingIds) {}
    public record CreateOrderRequest(String qrToken, String customerNote, List<OrderItemRequest> items) {}

    private record ToppingLine(long toppingId, String name, BigDecimal price) {}
    private record PreparedLine(
            long itemId,
            long variantId,
            String itemName,
            String variantName,
            BigDecimal basePrice,
            BigDecimal toppingTotal,
            int quantity,
            BigDecimal lineTotal,
            List<ToppingLine> toppings) {}

    @Transactional
    public Map<String, Object> createOrder(CreateOrderRequest request) {
        if (request == null || request.qrToken() == null || request.items() == null || request.items().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Thông tin đặt món không đầy đủ hoặc giỏ hàng đang trống.");
        }
        if (request.items().size() > 30) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Một đơn hàng không được vượt quá 30 dòng món.");
        }

        UUID token;
        try {
            token = UUID.fromString(request.qrToken());
        } catch (IllegalArgumentException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "QRToken không hợp lệ.");
        }

        Map<String, Object> table;
        try {
            table = jdbc.queryForMap(
                    "SELECT table_id, table_number, table_code FROM cafe_tables WHERE qr_token = ? AND is_active = TRUE",
                    token);
        } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Không tìm thấy bàn hoặc bàn đang ngừng hoạt động.");
        }

        long tableId = ((Number) table.get("table_id")).longValue();
        String tableCode = (String) table.get("table_code");
        List<PreparedLine> prepared = new ArrayList<>();
        BigDecimal orderTotal = BigDecimal.ZERO;

        for (OrderItemRequest itemRequest : request.items()) {
            if (itemRequest == null || itemRequest.variantId() == null || itemRequest.quantity() == null
                    || itemRequest.quantity() < 1 || itemRequest.quantity() > 20) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Số lượng hoặc lựa chọn sản phẩm không hợp lệ.");
            }

            Map<String, Object> variant;
            try {
                variant = jdbc.queryForMap(
                        """
                        SELECT mi.item_id, mi.item_name, v.variant_id, v.variant_name, v.price
                        FROM menu_item_variants v
                        JOIN menu_items mi ON mi.item_id = v.item_id
                        WHERE v.variant_id = ? AND v.is_available = TRUE
                          AND mi.is_available = TRUE AND v.price > 0
                        """,
                        itemRequest.variantId());
            } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Món hoặc size đã ngừng bán hoặc chưa có giá.");
            }

            long itemId = ((Number) variant.get("item_id")).longValue();
            long variantId = ((Number) variant.get("variant_id")).longValue();
            String itemName = (String) variant.get("item_name");
            String variantName = (String) variant.get("variant_name");
            BigDecimal basePrice = (BigDecimal) variant.get("price");

            List<ToppingLine> selectedToppings = new ArrayList<>();
            BigDecimal toppingTotal = BigDecimal.ZERO;
            Set<Long> uniqueToppingIds = new HashSet<>();
            List<Long> toppingIds = itemRequest.toppingIds() == null ? List.of() : itemRequest.toppingIds();
            if (toppingIds.size() > 10) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Mỗi món chỉ được chọn tối đa 10 topping.");
            }

            for (Long toppingId : toppingIds) {
                if (toppingId == null || !uniqueToppingIds.add(toppingId)) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Danh sách topping không hợp lệ hoặc bị trùng.");
                }
                try {
                    Map<String, Object> topping = jdbc.queryForMap(
                            """
                            SELECT t.topping_id, t.topping_name, t.additional_price
                            FROM toppings t
                            JOIN menu_item_toppings mit ON mit.topping_id = t.topping_id
                            WHERE t.topping_id = ? AND mit.item_id = ? AND t.is_available = TRUE
                            """,
                            toppingId, itemId);
                    BigDecimal extra = (BigDecimal) topping.get("additional_price");
                    selectedToppings.add(new ToppingLine(
                            ((Number) topping.get("topping_id")).longValue(),
                            (String) topping.get("topping_name"), extra));
                    toppingTotal = toppingTotal.add(extra);
                } catch (org.springframework.dao.EmptyResultDataAccessException ex) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Topping không hợp lệ hoặc chưa được bật bán cho món này.");
                }
            }

            BigDecimal lineTotal = basePrice.add(toppingTotal).multiply(BigDecimal.valueOf(itemRequest.quantity()));
            orderTotal = orderTotal.add(lineTotal);
            prepared.add(new PreparedLine(itemId, variantId, itemName, variantName, basePrice,
                    toppingTotal, itemRequest.quantity(), lineTotal, selectedToppings));
        }

        String orderCode = "CF-" + tableCode + "-" + LocalDate.now().format(DateTimeFormatter.BASIC_ISO_DATE)
                + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase(Locale.ROOT);

        Long orderId = jdbc.queryForObject(
                """
                INSERT INTO customer_orders(order_code, table_id, customer_note, status, total_amount)
                VALUES (?, ?, ?, 'NEW', ?)
                RETURNING order_id
                """,
                Long.class, orderCode, tableId, request.customerNote(), orderTotal);

        for (PreparedLine line : prepared) {
            Long orderItemId = jdbc.queryForObject(
                    """
                    INSERT INTO order_items(
                        order_id, item_id, variant_id, item_name_snapshot, variant_name_snapshot,
                        base_unit_price, topping_unit_total, quantity, line_total
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                    RETURNING order_item_id
                    """,
                    Long.class, orderId, line.itemId(), line.variantId(), line.itemName(), line.variantName(),
                    line.basePrice(), line.toppingTotal(), line.quantity(), line.lineTotal());

            for (ToppingLine topping : line.toppings()) {
                jdbc.update(
                        """
                        INSERT INTO order_item_toppings(order_item_id, topping_id, topping_name_snapshot, additional_price)
                        VALUES (?, ?, ?, ?)
                        """,
                        orderItemId, topping.toppingId(), topping.name(), topping.price());
            }
        }

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("success", true);
        result.put("orderCode", orderCode);
        result.put("tableNumber", table.get("table_number"));
        result.put("totalAmount", orderTotal);
        result.put("status", "NEW");
        result.put("message", "Đặt món thành công.");
        return result;
    }
}
