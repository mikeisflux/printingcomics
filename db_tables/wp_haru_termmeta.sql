/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_haru_termmeta`; */
/* PRE_TABLE_NAME: `1776400480_wp_haru_termmeta`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_haru_termmeta` ( `meta_id` bigint NOT NULL AUTO_INCREMENT, `term_id` bigint NOT NULL, `haru_term_id` bigint NOT NULL, `meta_key` varchar(255) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `meta_value` longtext COLLATE utf8mb4_unicode_520_ci, PRIMARY KEY (`meta_id`), KEY `term_id` (`term_id`), KEY `meta_key` (`meta_key`(191))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
