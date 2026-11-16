-- Cafe QR Ordering Website - seed data
-- Danh mục đồ ăn chỉ là Snacks. Chưa tự tạo món Snacks vì nhóm chưa cung cấp tên/giá từng món.
-- Toàn bộ menu đồ uống được giữ lại; size M = 45.000đ, L = 55.000đ.

INSERT INTO menu_categories(category_name)
VALUES ('Snacks'), ('Đồ uống')
ON CONFLICT (category_name) DO NOTHING;

INSERT INTO cafe_tables(table_number, table_code)
SELECT series.n, 'BAN' || LPAD(series.n::TEXT, 2, '0')
FROM generate_series(1, 10) AS series(n)
ON CONFLICT (table_number) DO NOTHING;

WITH drinks(item_name) AS (
    VALUES
    ('Trà lựu'),
    ('Trà đào'),
    ('Trà sữa'),
    ('Trà sữa Thái xanh'),
    ('Bạc xỉu'),
    ('Cà phê sữa đá'),
    ('Cà phê đen đá'),
    ('Trà mãng cầu'),
    ('Trà nhiệt đới'),
    ('Trà đá me'),
    ('Trà tắc'),
    ('Trà sữa ô long trứng nướng'),
    ('Trà sữa truyền thống'),
    ('Trà sữa dừa nướng'),
    ('Cà phê muối'),
    ('Trà ổi hồng'),
    ('Trà dâu tằm'),
    ('Sữa chua đá bào'),
    ('Sữa bắp'),
    ('Sữa đậu nành')
)
INSERT INTO menu_items(category_id, item_name, is_available)
SELECT c.category_id, d.item_name, TRUE
FROM drinks d
JOIN menu_categories c ON c.category_name = 'Đồ uống'
ON CONFLICT (category_id, item_name) DO NOTHING;

-- Mọi đồ uống dùng hai size theo menu nhóm cung cấp.
INSERT INTO menu_item_variants(item_id, variant_name, price, is_available)
SELECT mi.item_id, v.variant_name, v.price, TRUE
FROM menu_items mi
JOIN menu_categories c ON c.category_id = mi.category_id
CROSS JOIN (VALUES ('M', 45000::NUMERIC), ('L', 55000::NUMERIC)) AS v(variant_name, price)
WHERE c.category_name = 'Đồ uống'
ON CONFLICT (item_id, variant_name) DO NOTHING;

-- Topping được tạo sẵn nhưng tạm ẩn cho tới khi Admin xác nhận giá/phụ thu và bật bán.
INSERT INTO toppings(topping_name, additional_price, is_available)
VALUES
('Trân châu đen', 0, FALSE),
('Trân châu trắng', 0, FALSE),
('Pudding', 0, FALSE),
('Phô mai', 0, FALSE),
('Thạch sương sáo', 0, FALSE),
('Kem trứng', 0, FALSE)
ON CONFLICT (topping_name) DO NOTHING;

-- Topping được gắn với các sản phẩm Trà sữa.
INSERT INTO menu_item_toppings(item_id, topping_id)
SELECT mi.item_id, t.topping_id
FROM menu_items mi
JOIN menu_categories c ON c.category_id = mi.category_id
JOIN toppings t ON TRUE
WHERE c.category_name = 'Đồ uống'
  AND mi.item_name LIKE 'Trà sữa%'
ON CONFLICT DO NOTHING;

-- Sau khi chạy: Admin cần thêm từng món Snacks cùng giá thật trong Admin Dashboard.
