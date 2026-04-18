/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_wpforms_logs`; */
/* PRE_TABLE_NAME: `1776400480_wp_wpforms_logs`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_wpforms_logs` ( `id` bigint NOT NULL AUTO_INCREMENT, `title` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL, `message` longtext COLLATE utf8mb4_unicode_520_ci NOT NULL, `types` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL, `create_at` datetime NOT NULL, `form_id` bigint DEFAULT NULL, `entry_id` bigint DEFAULT NULL, `user_id` bigint DEFAULT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
