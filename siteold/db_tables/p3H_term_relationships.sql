/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `p3H_term_relationships`; */
/* PRE_TABLE_NAME: `1776400480_p3H_term_relationships`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_p3H_term_relationships` ( `object_id` bigint unsigned NOT NULL DEFAULT '0', `term_taxonomy_id` bigint unsigned NOT NULL DEFAULT '0', `term_order` int NOT NULL DEFAULT '0', PRIMARY KEY (`object_id`,`term_taxonomy_id`), KEY `term_taxonomy_id` (`term_taxonomy_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_p3H_term_relationships` (`object_id`, `term_taxonomy_id`, `term_order`) VALUES (1,1,0),(4,2,0),(5,3,0);
