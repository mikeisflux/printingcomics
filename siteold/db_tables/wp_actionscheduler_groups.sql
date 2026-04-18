/* CUSTOM VARS START */
/* REAL_TABLE_NAME: `wp_actionscheduler_groups`; */
/* PRE_TABLE_NAME: `1776400480_wp_actionscheduler_groups`; */
/* CUSTOM VARS END */

CREATE TABLE IF NOT EXISTS `1776400480_wp_actionscheduler_groups` ( `group_id` bigint unsigned NOT NULL AUTO_INCREMENT, `slug` varchar(255) COLLATE utf8mb4_unicode_520_ci NOT NULL, PRIMARY KEY (`group_id`), KEY `slug` (`slug`(191))) ENGINE=InnoDB AUTO_INCREMENT=21 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_520_ci;
INSERT INTO `1776400480_wp_actionscheduler_groups` (`group_id`, `slug`) VALUES (1,'action-scheduler-migration'),(2,''),(3,'woocommerce_payments'),(4,'gla'),(5,'mc-woocommerce'),(6,'woocommerce-db-updates'),(7,'woocommerce-remote-inbox-engine'),(8,'wc-admin-data'),(9,'wc_update_product_default_cat'),(10,'wpforms'),(11,'wc_batch_processes'),(12,'wt_pklist_save_default_templates_group'),(13,'wt_pklist_get_invoice_number_count_auto_generation'),(14,'wp_mail_smtp'),(15,'count'),(16,'instawp-connect'),(17,'wc_delete_related_product_transients_group'),(18,'ActionScheduler'),(19,'woocommerce'),(20,'woocommerce-payments');
