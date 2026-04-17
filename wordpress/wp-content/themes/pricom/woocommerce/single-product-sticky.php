<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

global $product;

$single_layout = get_post_meta( get_the_ID(), 'haru_layout', true );
if ( ( $single_layout == '' ) || ( $single_layout == 'default' ) ) {
    $single_layout = haru_get_option( 'haru_single_product_layout', 'haru-container' );
}

$product_sticky_cart = get_post_meta( get_the_ID(), 'haru_product_sticky_cart', true );
if ( ( $product_sticky_cart == '' ) || ( $product_sticky_cart == 'default' ) ) {
    $product_sticky_cart = haru_get_option( 'haru_single_product_sticky_cart', 'no-sticky' );
}

if ( $product_sticky_cart != 'sticky' ) return; 

if ( is_product() ) :
?>
    <div class="single-product-sticky">
        <div class="<?php echo esc_attr( $single_layout ); ?>">
            <div class="single-product-sticky__content">
                <div class="single-product-sticky__image">
                    <img src="<?php echo wp_get_attachment_url( $product->get_image_id() ); ?>" alt="<?php echo esc_attr( $product->get_title() ); ?>"/>
                </div>
                <div class="single-product-sticky__info">
                    <div class="single-product-sticky__title"><?php echo esc_html__( 'You\'re viewing: ', 'pricom' ); ?><strong><?php echo wp_kses_post( $product->get_title() ); ?></strong></div>
                    <div class="single-product-sticky__summary">
                        <div class="single-product-sticky__price">
                            <?php echo wp_kses_post( $product->get_price_html() ); ?>
                        </div>
                        <div class="single-product-sticky__rating">
                            <?php echo wc_get_rating_html( $product->get_average_rating() ); ?>
                        </div>
                    </div>
                </div>
                <div class="single-product-sticky__btn">
                    <?php echo do_shortcode( '[add_to_cart id=' . $product->get_id() . ' show_price="false" style=""]' ) ?>
                </div>
            </div>
        </div>
    </div>
<?php
    endif;