<?php
/**
 * Product Loop Start
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/loop/loop-start.php.
 *
 * HOWEVER, on occasion WooCommerce will need to update template files and you
 * (the theme developer) will need to copy the new files to your theme to
 * maintain compatibility. We try to do this as little as possible, but it does
 * happen. When this occurs the version of the template file will be bumped and
 * the readme will list any important changes.
 *
 * @see         https://docs.woocommerce.com/document/template-structure/
 * @package     WooCommerce\Templates
 * @version     3.3.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( isset( $_COOKIE['shopDefaultLayout'] ) ) {
    $shopDefaultLayout = $_COOKIE['shopDefaultLayout'];
} else {
    $shopDefaultLayout = 'layout-grid';
}

$columns = wc_get_loop_prop( 'columns' );

// Use for Demo
if ( isset( $_GET['shop_layout'] ) ) {
    $shopDefaultLayout = 'layout-' . wc_clean( $_GET['shop_layout'] );
}

if ( isset( $_GET['shop_columns'] ) ) {
    $columns = wc_clean( $_GET['shop_columns'] );
}

// Process cookie in single product
if ( is_product() ) {
    $shopDefaultLayout = 'layout-grid';
}
?>
<div class="products <?php echo esc_html( ( $shopDefaultLayout == 'layout-grid' ) ? 'layout-grid' : 'layout-list' ); ?> grid-columns-<?php echo esc_attr( $columns ); ?> grid-columns--tablet3 grid-columns--mobile2">
