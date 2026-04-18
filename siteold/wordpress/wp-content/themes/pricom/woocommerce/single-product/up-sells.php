<?php
/**
 * Single Product Up-Sells
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/single-product/up-sells.php.
 *
 * HOWEVER, on occasion WooCommerce will need to update template files and you
 * (the theme developer) will need to copy the new files to your theme to
 * maintain compatibility. We try to do this as little as possible, but it does
 * happen. When this occurs the version of the template file will be bumped and
 * the readme will list any important changes.
 *
 * @see         https://docs.woocommerce.com/document/template-structure/
 * @package     WooCommerce\Templates
 * @version     3.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

if ( $upsells ) : 

$related_product_display_columns = haru_get_option( 'haru_related_product_display_columns', '4' );
$related_product_display_type = haru_get_option( 'haru_related_product_display_type', 'slideshow' );
?>

	<section class="up-sells upsells products">
		<?php
		$heading = apply_filters( 'woocommerce_product_upsells_products_heading', esc_html__( 'You may also like&hellip;', 'pricom' ) );

		if ( $heading ) :
			?>
			<h2 class="haru-heading haru-heading--style-1"><?php echo esc_html( $heading ); ?></h2>
		<?php endif; ?>

		<?php
            if ( $related_product_display_type == 'slideshow' ) :
        ?>
		<ul class="haru-carousel haru-carousel--nav-center haru-carousel--nav-opacity related-products owl-carousel owl-theme"
            data-items="<?php echo esc_attr( $related_product_display_columns ); ?>"
            data-items-tablet="3"
            data-items-mobile="2"
            data-margin="30"
            data-margin-tablet="20"
            data-margin-mobile="15"
            data-autoplay="false"
            data-loop="false"
            data-slide-duration="6000"
        >

        <?php haru_set_loop_prop( 'product_style', 'style-1' ); ?>
			<?php foreach ( $upsells as $upsell ) : ?>

				<?php
				$post_object = get_post( $upsell->get_id() );

				setup_postdata( $GLOBALS['post'] =& $post_object ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited, Squiz.PHP.DisallowMultipleAssignments.Found

				wc_get_template_part( 'content', 'product' );
				?>

			<?php endforeach; ?>
		<?php haru_reset_loop(); ?>

		</ul>

		<?php elseif ( $related_product_display_type == 'grid' ) : ?>
        <div class="related-grid layout-grid grid-columns-<?php echo esc_attr( $related_product_display_columns ); ?> grid-columns--tablet3 grid-columns--mobile2">

            <?php haru_set_loop_prop( 'product_style', 'style-1' ); ?>
				<?php foreach ( $upsells as $upsell ) : ?>

					<?php
					$post_object = get_post( $upsell->get_id() );

					setup_postdata( $GLOBALS['post'] =& $post_object ); // phpcs:ignore WordPress.WP.GlobalVariablesOverride.Prohibited, Squiz.PHP.DisallowMultipleAssignments.Found

					wc_get_template_part( 'content', 'product' );
					?>

				<?php endforeach; ?>
			<?php haru_reset_loop(); ?>
			
        </div>
        <?php endif; ?>

	</section>

	<?php
endif;

wp_reset_postdata();
