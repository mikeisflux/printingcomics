<?php
/**
 * Compare button template - Loop Layout
 *
 * @author  Your Inspiration Themes
 * @package YITH WooCommerce Compare
 * @version 3.0.0
 */

if ( ! class_exists( 'YITH_Woocompare' ) ) {
	exit;
} //

$haru_product_add_to_compare = haru_get_option( 'haru_product_add_to_compare', '1' );
if ( $haru_product_add_to_compare == '0' ) {
	return;
}

?>
<?php if ( is_plugin_active( 'yith-woocommerce-compare/init.php' ) ) : ?>
   	<?php 
   		if ( class_exists( 'YITH_Woocompare' ) ) {
			global $yith_woocompare, $product;

			$is_ajax = ( defined( 'DOING_AJAX' ) && DOING_AJAX );
			if ( $yith_woocompare->is_frontend() || $is_ajax ) {
				if ( $is_ajax ) {
					// Do something
				}

				if ( wp_is_mobile() ) {
					return;
				}

				echo '<div class="product-button product-button--compare">';
				echo '<a class="compare button" href="' . esc_url( $yith_woocompare->obj->add_product_url( $product->get_id() ) ) . '" data-product_id="' . $product->get_id() .'" rel="nofollow" data-tooltip_text="'. esc_html( 'Compare', 'pricom') . '">'.'<span class="haru-tooltip button-tooltip">' . get_option('yith_woocompare_button_text') . '</span></a>';
				echo '</div>';
			}
		}
   	?>
<?php endif; ?>