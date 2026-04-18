/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `iwp_db_sent`; */
/* PRE_TABLE_NAME: `1776400480_iwp_db_sent`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_iwp_db_sent` ( `id` int NOT NULL AUTO_INCREMENT, `table_name` text COLLATE utf8mb4_unicode_ci, `table_name_hash` char(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL, `offset` int DEFAULT '0', `rows_total` int DEFAULT '0', `completed` int DEFAULT '0', PRIMARY KEY (`id`), UNIQUE KEY `table_name_hash` (`table_name_hash`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
