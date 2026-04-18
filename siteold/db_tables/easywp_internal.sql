/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `easywp_internal`; */
/* PRE_TABLE_NAME: `1776400480_easywp_internal`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_easywp_internal` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `name` varchar(191) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `value` longtext COLLATE utf8mb4_unicode_520_ci NOT NULL, PRIMARY KEY (`id`), UNIQUE KEY `unique_name` (`name`)) ENGINE=InnoDB AUTO_INCREMENT=44 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_easywp_internal` (`id`, `name`, `value`) VALUES (1,'wpprefix','wp_');
