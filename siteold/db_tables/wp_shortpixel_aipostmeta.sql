/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_shortpixel_aipostmeta`; */
/* PRE_TABLE_NAME: `1776400480_wp_shortpixel_aipostmeta`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_shortpixel_aipostmeta` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `post_type` tinyint DEFAULT '1', `attach_id` bigint unsigned NOT NULL, `original_data` text COLLATE utf8mb4_unicode_520_ci, `generated_data` text COLLATE utf8mb4_unicode_520_ci, `old_filename` varchar(300) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `new_filename` varchar(300) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `status` int DEFAULT NULL, `tsUpdated` timestamp NULL DEFAULT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
