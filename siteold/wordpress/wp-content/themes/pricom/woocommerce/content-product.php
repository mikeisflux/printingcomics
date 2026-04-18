<?php
/**
 * The template for displaying product content within loops
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/content-product.php.
 *
 * HOWEVER, on occasion WooCommerce will need to update template files and you
 * (the theme developer) will need to copy the new files to your theme to
 * maintain compatibility. We try to do this as little as possible, but it does
 * happen. When this occurs the version of the template file will be bumped and
 * the readme will list any important changes.
 *
 * @see     https://docs.woocommerce.com/document/template-structure/
 * @package WooCommerce\Templates
 * @version 3.6.0
 */

defined( 'ABSPATH' ) || exit;

global $product;

// Ensure visibility.
if ( empty( $product ) || ! $product->is_visible() ) {
    return;
}

$product_style = haru_loop_prop( 'product_style' );
$product_customize = '';

if ( haru_product_customize_link( $product ) ) {
    $product_customize = ' product-customize';
}

// Use for Demo
if ( isset( $_GET['product_style'] ) ) {
    $product_style = wc_clean( $_GET['product_style'] );
}

?>
<div <?php wc_product_class( 'grid-item product-item ' . ( $product->get_average_rating() != '0' ? 'has-rating ' : '' ) . $product_style . $product_customize, $product->get_id() ); ?>>
    <div class="product-wrap">
        <?php
        /**
         * Hook: woocommerce_before_shop_loop_item.
         *
         * @hooked woocommerce_template_loop_product_link_open - 10 (removed in woocommerce-functions.php)
         */
        do_action( 'woocommerce_before_shop_loop_item' );
        ?>
        <div class="product-top">
            <div class="product-thumbnail">
                <?php
                /**
                 * woocommerce_before_shop_loop_item_title hook.
                 *
                 * @hooked woocommerce_show_product_loop_sale_flash - 10
                 * @hooked woocommerce_template_loop_product_thumbnail - 10
                 */
                add_action( 'woocommerce_before_shop_loop_item_title', 'woocommerce_template_loop_product_link_open', 5 );
                add_action( 'woocommerce_before_shop_loop_item_title', 'woocommerce_template_loop_product_link_close', 15 );
                do_action( 'woocommerce_before_shop_loop_item_title' );
                ?>
            </div>
            <div class="product-varations">
                <?php
                /**
                 * haru_woocommerce_product_variations hook
                 *
                 * @hooked haru_product_attribute_variation - 5
                 */
                do_action( 'haru_woocommerce_product_variations' );
                ?>
            </div>
            <div class="product-actions">
                <?php
                /**
                 * haru_woocommerce_product_actions hook
                 *
                 * @hooked haru_woocomerce_template_loop_compare - 5
                 * @hooked haru_woocomerce_template_loop_wishlist - 10
                 * @hooked woocommerce_template_loop_add_to_cart - 20
                 * @hooked haru_woocomerce_template_loop_quick_view - 25
                 */
                if ( haru_product_customize_link( $product ) ) {
                    remove_action( 'woocommerce_loop_add_to_cart_link', 'wcdp_add_product_link_customize' , 10, 2 );
                }

                do_action( 'haru_woocommerce_product_actions' );
                ?>
            </div>

            <?php if ( $product_style == 'style-1' ) : ?>
                <?php
                    if ( haru_product_customize_link( $product ) ) :
                        add_action( 'woocommerce_loop_add_to_cart_link', 'wcdp_add_product_link_customize' , 10, 2 );
                ?>
                <div class="product-design">
                    <?php
                        woocommerce_template_loop_add_to_cart();
                    ?>
                </div>
                <?php endif; ?>
            <?php endif; ?>
        </div>
        
        <div class="product-info">
            <?php
                /**
                 * woocommerce_shop_loop_item_title hook.
                 *
                 * @hooked woocommerce_template_loop_product_title - 10
                 */
                add_action( 'woocommerce_shop_loop_item_title', 'woocommerce_template_loop_product_link_open', 5 );
                add_action( 'woocommerce_shop_loop_item_title', 'woocommerce_template_loop_product_link_close', 15 );
                do_action( 'woocommerce_shop_loop_item_title' );
                /**
                 * woocommerce_after_shop_loop_item_title hook.
                 *
                 * @hooked woocommerce_template_loop_rating - 5
                 * @hooked woocommerce_template_loop_price - 10
                 * @hooked haru_excerpt_in_product_archives - 15
                 */

                do_action( 'woocommerce_after_shop_loop_item_title' );
            ?>

            <?php if ( $product_style == 'style-2' ) : ?>
                <?php
                    if ( haru_product_customize_link( $product ) ) :
                        add_action( 'woocommerce_loop_add_to_cart_link', 'wcdp_add_product_link_customize' , 10, 2 );
                ?>
                <div class="product-design">
                    <?php
                        woocommerce_template_loop_add_to_cart();
                    ?>
                </div>
                <?php endif; ?>
            <?php endif; ?>
        </div>
        <?php
        /**
         * Hook: woocommerce_after_shop_loop_item.
         *
         * @hooked woocommerce_template_loop_product_link_close - 5 (removed in woocommerce-functions.php)
         * @hooked woocommerce_template_loop_add_to_cart - 10 (removed in woocommerce-functions.php)
         */
        do_action( 'woocommerce_after_shop_loop_item' );
        ?>
    </div>
</div>
