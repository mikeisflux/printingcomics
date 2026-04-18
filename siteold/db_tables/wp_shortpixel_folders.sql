/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_shortpixel_folders`; */
/* PRE_TABLE_NAME: `1776400480_wp_shortpixel_folders`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_shortpixel_folders` ( `id` mediumint NOT NULL AUTO_INCREMENT, `path` varchar(512) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `name` varchar(150) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `path_md5` char(32) COLLATE utf8mb4_unicode_520_ci DEFAULT NULL, `file_count` int DEFAULT NULL, `status` smallint NOT NULL DEFAULT '0', `parent` smallint DEFAULT '0', `ts_checked` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, `ts_updated` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00', `ts_created` timestamp NOT NULL DEFAULT '0000-00-00 00:00:00', PRIMARY KEY (`id`), KEY `path` (`path`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
