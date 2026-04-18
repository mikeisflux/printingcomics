<?php
/**
 * Single Product Image
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/single-product/product-image.php.
 *
 * HOWEVER, on occasion WooCommerce will need to update template files and you
 * (the theme developer) will need to copy the new files to your theme to
 * maintain compatibility. We try to do this as little as possible, but it does
 * happen. When this occurs the version of the template file will be bumped and
 * the readme will list any important changes.
 *
 * @see     https://woocommerce.com/document/template-structure/
 * @package WooCommerce\Templates
 * @version 9.0.0
 */

defined( 'ABSPATH' ) || exit;

// Note: `wc_get_gallery_image_html` was added in WC 3.3.2 and did not exist prior. This check protects against theme overrides being used on older versions of WC.
if ( ! function_exists( 'wc_get_gallery_image_html' ) ) {
    return;
}

global $product;

// Product style
$product_single_style = get_post_meta( get_the_ID(), 'haru_product' . '_single_style', true );
if ( ! in_array( $product_single_style, array( 'horizontal', 'vertical', 'vertical_gallery', 'grid_gallery' ) ) ) {
    $product_single_style = haru_get_option( 'haru_single_product_style', 'horizontal' );
}

// Quickview always use Horizontal layout
if ( wp_doing_ajax() ) {
	$product_single_style = 'horizontal';
}

if ( in_array( $product_single_style, array( 'horizontal', 'vertical' ) ) ) {
    wc_get_template_part( 'single-product/product-image', 'slide' );
} else if ( in_array( $product_single_style, array( 'vertical_gallery' ) ) ) {
    wc_get_template_part( 'single-product/product-image', 'gallery' );
} else {
    wc_get_template_part( 'single-product/product-image', 'grid' );
}