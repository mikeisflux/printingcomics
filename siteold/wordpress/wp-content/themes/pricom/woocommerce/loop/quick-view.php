<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

$product_quick_view = haru_get_option( 'haru_product_quick_view', '1' );

if ( $product_quick_view == '0' ) {
	return;
}

global $product;

$href = admin_url( 'admin-ajax.php', is_ssl() ? 'https' : 'http' ) . '?ajax=true&action=load_quickview_content&product_id=' . $product->get_id();
echo '<div class="product-button product-button--quickview">';
echo '<a class="quickview" href="' . esc_url( $href ) . '"><span class="haru-tooltip button-tooltip">' . esc_html__( 'Quick view', 'pricom' ) . '</span></a>';
echo '</div>';