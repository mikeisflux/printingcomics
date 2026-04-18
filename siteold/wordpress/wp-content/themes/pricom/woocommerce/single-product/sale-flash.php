<?php
/**
 * Single Product Sale Flash
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/single-product/sale-flash.php.
 *
 * HOWEVER, on occasion WooCommerce will need to update template files and you
 * (the theme developer) will need to copy the new files to your theme to
 * maintain compatibility. We try to do this as little as possible, but it does
 * happen. When this occurs the version of the template file will be bumped and
 * the readme will list any important changes.
 *
 * @see         https://docs.woocommerce.com/document/template-structure/
 * @author      WooThemes
 * @package     WooCommerce/Templates
 * @version     1.6.4
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

global $post, $product;

$product_new = get_post_meta( get_the_ID(), 'haru_product_new', true );
$product_hot = get_post_meta( get_the_ID(), 'haru_product_hot', true );

?>
<div class="product-label">
<?php if ( $product->is_on_sale() ) : ?>

	<?php echo apply_filters( 'woocommerce_sale_flash', '<span class="product-label__item product-label__item--onsale">' . esc_html__( 'Sale!', 'pricom' ) . '</span>', $post, $product ); ?>

<?php endif; ?>

<?php if ( 'yes' == $product_new ) : ?>

    <span class="product-label__item product-label__item--onnew"><?php echo esc_html__( 'New', 'pricom' ) ?></span>

<?php endif; ?>

<?php if ( 'yes' == $product_hot ) : ?>

    <span class="product-label__item product-label__item--onhot"><?php echo esc_html__( 'Hot', 'pricom' ) ?></span>

<?php endif; ?>

<?php if ( ! $product->is_in_stock() ) : ?>

    <span class="product-label__item product-label__item--onsold"><?php echo esc_html__( 'Sold', 'pricom' ) ?></span>

<?php endif; ?>
</div>
