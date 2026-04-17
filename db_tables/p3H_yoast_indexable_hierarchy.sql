/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `p3H_yoast_indexable_hierarchy`; */
/* PRE_TABLE_NAME: `1776400480_p3H_yoast_indexable_hierarchy`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_p3H_yoast_indexable_hierarchy` ( `indexable_id` int unsigned NOT NULL, `ancestor_id` int unsigned NOT NULL, `depth` int unsigned DEFAULT NULL, `blog_id` bigint NOT NULL DEFAULT '1', PRIMARY KEY (`indexable_id`,`ancestor_id`), KEY `indexable_id` (`indexable_id`), KEY `ancestor_id` (`ancestor_id`), KEY `depth` (`depth`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_p3H_yoast_indexable_hierarchy` (`indexable_id`, `ancestor_id`, `depth`, `blog_id`) VALUES (1,0,0,1);
