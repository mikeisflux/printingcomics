/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `p3H_yoast_seo_links`; */
/* PRE_TABLE_NAME: `1776400480_p3H_yoast_seo_links`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_p3H_yoast_seo_links` ( `id` bigint unsigned NOT NULL AUTO_INCREMENT, `url` varchar(255) DEFAULT NULL, `post_id` bigint unsigned DEFAULT NULL, `target_post_id` bigint unsigned DEFAULT NULL, `type` varchar(8) DEFAULT NULL, `indexable_id` int unsigned DEFAULT NULL, `target_indexable_id` int unsigned DEFAULT NULL, `height` int unsigned DEFAULT NULL, `width` int unsigned DEFAULT NULL, `size` int unsigned DEFAULT NULL, `language` varchar(32) DEFAULT NULL, `region` varchar(32) DEFAULT NULL, PRIMARY KEY (`id`), KEY `link_direction` (`post_id`,`type`), KEY `indexable_link_direction` (`indexable_id`,`type`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3;
