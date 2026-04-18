<?php
/**
 * The template for displaying product widget entries.
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/content-widget-reviews.php
 *
 * HOWEVER, on occasion WooCommerce will need to update template files and you
 * (the theme developer) will need to copy the new files to your theme to
 * maintain compatibility. We try to do this as little as possible, but it does
 * happen. When this occurs the version of the template file will be bumped and
 * the readme will list any important changes.
 *
 * @see     https://docs.woocommerce.com/document/template-structure/
 * @package WooCommerce\Templates
 * @version 3.4.0
 */

defined( 'ABSPATH' ) || exit;

?>
<li>
	<?php do_action( 'woocommerce_widget_product_review_item_start', $args ); ?>

	<span class="widget-product-item">
		<a href="<?php echo esc_url( get_comment_link( $comment->comment_ID ) ); ?>" class="widget-product-img">
			<?php echo do_shortcode( $product->get_image() ); ?>
		</a>

		<span class="widget-product-info">
			<a href="<?php echo esc_url( $product->get_permalink() ); ?>" class="product-title">
				<?php echo do_shortcode( $product->get_name() ); ?>
			</a>

			<?php echo wc_get_rating_html( intval( get_comment_meta( $comment->comment_ID, 'rating', true ) ) ); ?>

			<span class="reviewer"><?php echo sprintf( esc_html__( 'by %s', 'pricom' ), get_comment_author( $comment->comment_ID ) ); ?></span>
		</span>
	</span>

	<?php do_action( 'woocommerce_widget_product_review_item_end', $args ); ?>
</li>
