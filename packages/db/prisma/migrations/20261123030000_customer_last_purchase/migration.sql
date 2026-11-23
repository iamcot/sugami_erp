-- Customers made from marketplace/counter orders had no last-purchase date: fill it from their orders.
UPDATE `customers` c
JOIN (
    SELECT `customer_id`, MAX(`ordered_at`) AS last_at
    FROM `orders`
    WHERE `customer_id` IS NOT NULL AND `status` <> 'cancelled'
    GROUP BY `customer_id`
) o ON o.`customer_id` = c.`id`
SET c.`last_purchase_at` = o.last_at
WHERE c.`last_purchase_at` IS NULL OR c.`last_purchase_at` < o.last_at;
