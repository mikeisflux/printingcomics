/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `iwp_files_sent`; */
/* PRE_TABLE_NAME: `1776400480_iwp_files_sent`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_iwp_files_sent` ( `id` int NOT NULL AUTO_INCREMENT, `filepath` text COLLATE utf8mb4_unicode_ci, `filepath_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL, `sent` int DEFAULT '0', `size` int DEFAULT NULL, `sent_filename` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL, `checksum` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT NULL, `file_type` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'file', `file_count` int NOT NULL DEFAULT '1', PRIMARY KEY (`id`), UNIQUE KEY `filepath_hash` (`filepath_hash`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
