/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `p3H_yoast_primary_term`; */
/* PRE_TABLE_NAME: `1776400480_p3H_yoast_primary_term`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_p3H_yoast_primary_term` ( `id` int unsigned NOT NULL AUTO_INCREMENT, `post_id` bigint DEFAULT NULL, `term_id` bigint DEFAULT NULL, `taxonomy` varchar(32) COLLATE utf8mb4_unicode_520_ci NOT NULL, `created_at` datetime DEFAULT NULL, `updated_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `blog_id` bigint NOT NULL DEFAULT '1', PRIMARY KEY (`id`), KEY `post_taxonomy` (`post_id`,`taxonomy`), KEY `post_term` (`post_id`,`term_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
