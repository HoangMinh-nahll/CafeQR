-- Kiểm tra nhanh Database sau khi chạy schema và seed.
SELECT COUNT(*) AS total_tables FROM cafe_tables;
SELECT table_code, qr_token FROM cafe_tables ORDER BY table_number;
SELECT category_name FROM menu_categories ORDER BY category_id;
SELECT COUNT(*) AS total_drinks
FROM menu_items mi JOIN menu_categories c ON c.category_id = mi.category_id
WHERE c.category_name = 'Đồ uống';
SELECT mi.item_name, v.variant_name, v.price, v.is_available
FROM menu_items mi
JOIN menu_item_variants v ON v.item_id = mi.item_id
JOIN menu_categories c ON c.category_id = mi.category_id
WHERE c.category_name = 'Đồ uống'
ORDER BY mi.item_name, v.variant_name;
SELECT topping_name, additional_price, is_available FROM toppings ORDER BY topping_name;
SELECT o.order_code, t.table_code, o.status, o.total_amount, o.created_at
FROM customer_orders o JOIN cafe_tables t ON t.table_id = o.table_id
ORDER BY o.created_at DESC LIMIT 20;
