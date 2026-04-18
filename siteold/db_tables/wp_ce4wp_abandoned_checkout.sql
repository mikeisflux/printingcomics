/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_ce4wp_abandoned_checkout`; */
/* PRE_TABLE_NAME: `1776400480_wp_ce4wp_abandoned_checkout`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_ce4wp_abandoned_checkout` ( `checkout_id` bigint unsigned NOT NULL AUTO_INCREMENT, `user_id` bigint unsigned NOT NULL DEFAULT '0', `user_email` varchar(200) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', `checkout_contents` longtext COLLATE utf8mb4_unicode_520_ci NOT NULL, `checkout_updated` datetime NOT NULL DEFAULT '0000-00-00 00:00:00', `checkout_updated_ts` int unsigned NOT NULL DEFAULT '0', `checkout_created` datetime NOT NULL DEFAULT '0000-00-00 00:00:00', `checkout_created_ts` int unsigned NOT NULL DEFAULT '0', `checkout_recovered` datetime DEFAULT '0000-00-00 00:00:00', `checkout_recovered_ts` int unsigned DEFAULT '0', `checkout_consent` int unsigned NOT NULL DEFAULT '1', `checkout_uuid` varchar(36) COLLATE utf8mb4_unicode_520_ci NOT NULL DEFAULT '', PRIMARY KEY (`checkout_id`), UNIQUE KEY `checkout_uuid` (`checkout_uuid`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
