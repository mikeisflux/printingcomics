<?php
/**
 * The template for displaying product content in the single-product.php template
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/content-single-product.php.
 *
 * HOWEVER, on occasion WooCommerce will need to update template files and you
 * (the theme developer) will need to copy the new files to your theme to
 * maintain compatibility. We try to do this as little as possible, but it does
 * happen. When this occurs the version of the template file will be bumped and
 * the readme will list any important changes.
 *
 * @see     https://docs.woocommerce.com/document/template-structure/
 * @package WooCommerce/Templates
 * @version 3.6.0
 */

defined( 'ABSPATH' ) || exit;

global $product;

// Product style
$product_single_style = get_post_meta( get_the_ID(), 'haru_product' . '_single_style', true );
if ( ! in_array( $product_single_style, array( 'horizontal', 'vertical', 'vertical_gallery', 'grid_gallery' ) ) ) {
    $product_single_style = haru_get_option( 'haru_single_product_style', 'horizontal' );
}

$product_sticky_image = get_post_meta( get_the_ID(), 'haru_product' . '_sticky_image', true );
if ( ! in_array( $product_sticky_image, array( 'no-sticky', 'sticky' ) ) ) {
    $product_sticky_image = haru_get_option( 'haru_single_product_sticky_image', 'no-sticky' );
}

if ( ! in_array( $product_single_style, array( 'horizontal', 'vertical' ) ) ) {
    $product_sticky_image = '';
}

$gallery_thumb_position = get_post_meta( get_the_ID(), 'haru_product' . '_gallery_thumb_position', true );
if ( ! in_array( $gallery_thumb_position, array( 'thumbnail-left', 'thumbnail-right' ) ) ) {
    $gallery_thumb_position = haru_get_option( 'haru_single_product_thumbnail_position', 'thumbnail-left' );
}

$product_customize = '';

if ( haru_product_customize_link( $product ) ) {
    $product_customize = ' product-customize';
    remove_action( 'woocommerce_after_add_to_cart_button', 'wcdp_add_product_single_link_customize' );
}   

// Product Extra Options
$product_extra_options = '';
if ( true == haru_check_wpc_product_options_plugin_status() ) {
    $product_extra_options = get_post_meta( get_the_ID(), 'haru_product' . '_extra_options', true );

    if ( ! in_array( $product_extra_options, array( 'show', 'toggle' ) ) ) {
        $product_extra_options = haru_get_option( 'haru_single_product_extra_options', 'show' );
    }

    $product_extra_options = 'extra-options-' . $product_extra_options;
}

?>

<?php
    /**
     * woocommerce_before_single_product hook.
     *
     * @hooked wc_print_notices - 10
     */
     do_action( 'woocommerce_before_single_product' );

    if ( post_password_required() ) {
        echo get_the_password_form(); // WPCS: XSS ok.
        return;
    }
?>

<div id="product-<?php the_ID(); ?>" <?php wc_product_class( '' . $product_customize, $product ); ?>>
    <div class="single-product-top <?php echo esc_attr( $product_single_style . ' ' . $product_sticky_image ); ?>">
        <div class="single-product-image-wrap <?php echo esc_attr( $product_single_style . ' ' . $gallery_thumb_position . ' ' . $product_sticky_image ); ?>">
            <div class="single-product-image-content">
                <?php
                    /**
                     * woocommerce_before_single_product_summary hook.
                     *
                     * @hooked woocommerce_show_product_sale_flash - 10
                     * @hooked woocommerce_show_product_images - 20
                     */
                    do_action( 'woocommerce_before_single_product_summary' );
                ?>
            </div>
        </div>
        <?php if ( true == haru_check_wpc_product_options_plugin_status() ) : ?>
        <div class="single-product-summary <?php echo esc_attr( $product_extra_options ); ?>" data-heading="<?php echo esc_html__( 'Extra Product Options', 'pricom' ); ?>">
        <?php else : ?>
        <div class="single-product-summary">
        <?php endif; ?>
            <div class="summary entry-summary">
                <div class="summary-content">
                    <?php
                        $product_navigation = get_post_meta( get_the_ID(), 'haru_single_product_navigation', true );
                        if ( ( $product_navigation == '' ) || ( $product_navigation == 'default' ) ) {
                            $product_navigation = haru_get_option( 'haru_single_product_navigation', 'hide' );
                        }
                    ?>
                    <?php if ( $product_navigation == 'show' ) : ?>
                        <?php haru_product_nav(); ?>
                    <?php endif ?>
                    
                    <?php
                        /**
                         * woocommerce_single_product_summary hook.
                         *
                         * @hooked woocommerce_template_single_title - 5
                         * @hooked woocommerce_template_single_rating - 10
                         * @hooked woocommerce_template_single_price - 10
                         * @hooked woocommerce_template_single_excerpt - 20
                         * @hooked haru_woocommerce_template_single_size_guide - 25
                         * @hooked woocommerce_template_single_add_to_cart - 30
                         * @hooked woocommerce_template_single_meta - 40
                         * @hooked woocommerce_template_single_sharing - 50
                         * @hooked WC_Structured_Data::generate_product_data() - 60
                         */
                        if ( function_exists( 'wcdp_add_product_single_link_customize' ) ) {
                            add_action( 'woocommerce_before_add_to_cart_button', 'wcdp_add_product_single_link_customize' );
                        }

                        if ( $product_sticky_image == 'sticky' ) {
                            add_action( 'woocommerce_single_product_summary', 'woocommerce_output_product_data_tabs', 70 );
                        }
                    
                        do_action( 'woocommerce_single_product_summary' );

                        if ( $product_sticky_image == 'sticky' ) {
                            remove_action( 'woocommerce_single_product_summary', 'woocommerce_output_product_data_tabs', 70 );
                        }
                    ?>
                </div>

            </div><!-- .summary -->
        </div>
    </div>
    <div class="single-product-bottom">
        <?php
            /**
             * woocommerce_after_single_product_summary hook.
             *
             * @hooked woocommerce_output_product_data_tabs - 10
             * @hooked woocommerce_upsell_display - 15
             * @hooked woocommerce_output_related_products - 20
             */
            remove_action( 'woocommerce_after_single_product_summary', 'woocommerce_output_related_products', 20 );

            if ( $product_sticky_image == 'sticky' ) {
                remove_action( 'woocommerce_after_single_product_summary', 'woocommerce_output_product_data_tabs', 10 );
            }
            
            do_action( 'woocommerce_after_single_product_summary' );

            if ( $product_sticky_image == 'sticky' ) {
                add_action( 'woocommerce_after_single_product_summary', 'woocommerce_output_product_data_tabs', 10 );
            }
        ?>
    </div>
    <?php add_action( 'woocommerce_after_single_product', 'woocommerce_output_related_products', 20 ) ?>
</div><!-- #product-<?php the_ID(); ?> -->

<?php do_action( 'woocommerce_after_single_product' ); ?>
