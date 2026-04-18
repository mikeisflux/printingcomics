/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_sbi_instagram_feeds_posts`; */
/* PRE_TABLE_NAME: `1776400480_wp_sbi_instagram_feeds_posts`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_sbi_instagram_feeds_posts` ( `record_id` int unsigned NOT NULL AUTO_INCREMENT, `id` int unsigned NOT NULL, `instagram_id` varchar(1000) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `feed_id` varchar(1000) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `hashtag` varchar(1000) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', PRIMARY KEY (`record_id`), KEY `hashtag` (`hashtag`(191)), KEY `feed_id` (`feed_id`(191))) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
