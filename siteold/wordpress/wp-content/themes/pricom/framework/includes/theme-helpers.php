<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

if ( true == haru_check_woocommerce_status() ) {
    require_once( get_template_directory() . '/framework/includes/helpers/woo-adjacent-products.php' ); // Adjacent products
}