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
 * @see     https://docs.woocommerce.com/document/template-structure/
 * @author  WooThemes
 * @package WooCommerce/Templates
 * @version 3.3.2
 */

defined( 'ABSPATH' ) || exit;

global $post, $product;

// Product style
$single_product_style = get_post_meta( get_the_ID(), 'haru_product' . '_single_style', true );
if ( ! in_array( $single_product_style, array( 'horizontal', 'vertical', 'vertical_gallery', 'grid_gallery' ) ) ) {
    $single_product_style = haru_get_option( 'haru_single_product_style', 'horizontal' );
}

$index          = 0;
$product_images = array();
$image_ids      = array();

// Thumbnail image
if ( has_post_thumbnail() ) {
    $product_images[$index] = array(
        'image_id' => get_post_thumbnail_id()
    );
    $image_ids[$index] = get_post_thumbnail_id();
    $index++;
}

// Gallery images
$attachment_ids = $product->get_gallery_image_ids();
if ($attachment_ids) {
    foreach ( $attachment_ids as $attachment_id ) {
        if ( in_array($attachment_id,$image_ids) ) continue;
        $product_images[$index] = array(
            'image_id' => $attachment_id
        );
        $image_ids[$index] = $attachment_id;
        $index++;
    }
}

// Product variable images
if ( $product->is_type( 'variable' ) ) {
    // Variations cache
    $cache                = apply_filters( 'haru_variations_cache', true );
    $transient_name       = 'haru_variations_cache_' . $product->get_id();
    $available_variations = array();

    if ( $cache ) {
        $available_variations = get_transient( $transient_name );
    }

    if ( ! $available_variations ) {
        $available_variations = $product->get_available_variations();
        if ( $cache ) {
            set_transient( $transient_name, $available_variations, apply_filters( 'haru_variations_cache_time', WEEK_IN_SECONDS ) );
        }
    }
    
    if ( $available_variations ) {
        foreach ( $available_variations as $available_variation ) {
            $variation_id = $available_variation['variation_id'];
            if (has_post_thumbnail($variation_id)) {
                $variation_image_id = get_post_thumbnail_id($variation_id);

                if (in_array($variation_image_id,$image_ids)) {
                    $index_of = array_search($variation_image_id, $image_ids);
                    if (isset($product_images[$index_of]['variation_id'])) {
                        $product_images[$index_of]['variation_id'] .= $variation_id . '|';
                    } else {
                        $product_images[$index_of]['variation_id'] = '|' . $variation_id . '|';
                    }
                    continue;
                }

                $product_images[$index] = array(
                    'image_id'     => $variation_image_id,
                    'variation_id' => '|' . $variation_id . '|'
                );
                $image_ids[$index] = $variation_image_id;
                $index++;
            }
        }
    }
}
$attachment_count = count($attachment_ids);
if ( $attachment_count > 0 ) {
    $gallery = '[product-gallery]';
} else {
    $gallery = '';
}

// Process options
$single_product_thumbnail_columns = get_post_meta( get_the_ID(), 'haru_product' . '_gallery_thumb_columns', true );
if ( ! in_array( $single_product_thumbnail_columns, array( '2', '3', '4', '5' )) ) {
    $single_product_thumbnail_columns = haru_get_option( 'haru_single_product_thumbnail_columns', '4' );
}

$single_product_thumbnail_position = get_post_meta( get_the_ID(), 'haru_product' . '_gallery_thumb_position', true );
if ( ! in_array( $single_product_thumbnail_position, array( 'thumbnail-left', 'thumbnail-right' ) ) ) {
    $single_product_thumbnail_position = haru_get_option( 'haru_single_product_thumbnail_position', 'thumbnail-left' );
}

wp_enqueue_script( 'one-page-nav', get_template_directory_uri() . '/assets/libraries/one-page-nav/jquery.nav.js', array( 'jquery' ), '', true );
wp_enqueue_script( 'sticky-kit', get_template_directory_uri() . '/assets/libraries/sticky-kit/jquery.sticky-kit.min.js', array( 'jquery' ), '', true );
?>

<div class="single-product-image">
    <div class="product-images-wrap woocommerce-product-gallery images">
        <div id="product-images">
            <?php
                foreach($product_images as $key => $value) {
                    $index         = $key;
                    $image_id      = $value['image_id'];
                    $variation_id  = isset($value['variation_id']) ? $value['variation_id'] : '' ;
                    $image_title   = esc_attr( get_the_title( $image_id ) );
                    $image_caption = '';
                    $image_obj     = get_post( $image_id );
                    if ( isset($image_obj) && isset($image_obj->post_excerpt) ) {
                        $image_caption  = $image_obj->post_excerpt;
                    }
                    
                    $image_link     = wp_get_attachment_url( $image_id );
                    $image          = wp_get_attachment_image( $image_id, apply_filters( 'single_product_large_thumbnail_size', 'shop_single' ), array(
                        'title' => $image_title,
                        'alt'   => $image_title
                    ) );

                    // Check FPD
                    if ( class_exists( 'Fancy_Product_Designer' ) ) {
                        echo sprintf( '<div id="product-image-%s" class="product-image-item woocommerce-product-gallery__image">', $image_id );
                    } else {
                        echo sprintf( '<div id="product-image-%s" class="product-image-item">', $image_id );
                    }
                    if ( ! empty( $variation_id ) ) {
                        echo apply_filters( 'woocommerce_single_product_image_html', sprintf( '<a href="%s" class="product-image-lightbox" data-fancybox="product-gallery" data-caption="%s" data-elementor-open-lightbox="no" rel="product-gallery" data-variation_id="%s" data-index="%s"></a>%s', $image_link, $image_caption, $variation_id, $index, $image ), $post->ID );
                    } else {
                        echo apply_filters( 'woocommerce_single_product_image_html', sprintf( '<a href="%s" itemprop="image" class="product-image-lightbox" data-fancybox="product-gallery" data-caption="%s" data-elementor-open-lightbox="no" rel="product-gallery" data-index="%s"></a>%s', $image_link, $image_caption, $index, $image ), $post->ID );
                    }
                    echo '</div>';
                }
            ?>
        </div>
        <div class="product-images-actions">
            <?php
                $haru_product_video_url = get_post_meta( get_the_ID(), 'haru_product_video_url', true );
                if ( filter_var( $haru_product_video_url, FILTER_VALIDATE_URL ) == TRUE ) :
            ?>
                <div class="product-video product-gallery-btn">
                    <a href="<?php echo esc_url( $haru_product_video_url ); ?>" data-fancybox class="product-video-link"><span><?php echo esc_html__( 'Watch Video', 'pricom' ); ?></span></a>
                </div>
            <?php endif; ?>
            <div class="product-gallery-enlarge product-gallery-btn">
                <a href="javascript:;"><span><?php echo esc_html__( 'Click to enlarge', 'pricom' ); ?></span></a>
            </div>
        </div>
    </div>
</div>