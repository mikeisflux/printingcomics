/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `p3H_actionscheduler_logs`; */
/* PRE_TABLE_NAME: `1776400480_p3H_actionscheduler_logs`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_p3H_actionscheduler_logs` ( `log_id` bigint unsigned NOT NULL AUTO_INCREMENT, `action_id` bigint unsigned NOT NULL, `message` text COLLATE utf8mb4_unicode_520_ci NOT NULL, `log_date_gmt` datetime DEFAULT '0000-00-00 00:00:00', `log_date_local` datetime DEFAULT '0000-00-00 00:00:00', PRIMARY KEY (`log_id`), KEY `action_id` (`action_id`), KEY `log_date_gmt` (`log_date_gmt`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
