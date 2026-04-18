/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_mailchimp_carts`; */
/* PRE_TABLE_NAME: `1776400480_wp_mailchimp_carts`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_mailchimp_carts` ( `id` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL, `email` varchar(100) COLLATE utf8mb4_unicode_520_ci NOT NULL, `user_id` int DEFAULT NULL, `cart` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `created_at` datetime NOT NULL, PRIMARY KEY (`email`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
