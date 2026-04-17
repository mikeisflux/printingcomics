/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `p3H_nfd_data_event_queue`; */
/* PRE_TABLE_NAME: `1776400480_p3H_nfd_data_event_queue`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_p3H_nfd_data_event_queue` ( `id` bigint NOT NULL AUTO_INCREMENT, `event` longtext COLLATE utf8mb4_unicode_520_ci NOT NULL, `attempts` tinyint NOT NULL DEFAULT '0', `reserved_at` datetime DEFAULT NULL, `available_at` datetime NOT NULL, `created_at` datetime NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
