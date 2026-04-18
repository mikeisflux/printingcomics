<?php
/**
 * The Template for displaying product archives, including the main shop page which is a post type archive
 *
 * This template can be overridden by copying it to yourtheme/woocommerce/archive-product.php.
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
 * @version     2.0.0
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit; // Exit if accessed directly
}

$results_bar_class = '';
$results_bar_buttons = array();

// Filters
$filters_count = haru_get_active_filters_count();
if ( $filters_count ) {
    $results_bar_class = ' has-filters';
    $results_bar_buttons['filters'] = array(
        'id'    => 'haru-shop-filters-reset',
        'title' => sprintf( __( 'Filters active %s(%s)%s', 'pricom' ), '<span>', $filters_count, '</span>' )
    );
}

// Search
if ( ! empty( $_REQUEST['s'] ) ) { // Is search query set and not empty?
    $results_bar_class .= ' is-search';
    $results_bar_buttons['search_taxonomy'] = array(
        'id'    => 'haru-shop-search-taxonomy-reset',
        'title' => sprintf( __( 'Search results for %s&ldquo;%s&rdquo;%s', 'pricom' ), '<span>', esc_html( $_REQUEST['s'] ), '</span>' )
    );
}

// Taxonomy
else if ( is_product_taxonomy() ) {
    $results_bar_buttons['search_taxonomy'] = array(
        'id' => 'haru-shop-search-taxonomy-reset'
    );
    $current_term = $GLOBALS['wp_query']->get_queried_object();
    
    if ( is_product_category() ) {
        $results_bar_class .= ' is-category';
        $results_bar_buttons['search_taxonomy']['title'] = sprintf( __( 'Showing %s&ldquo;%s&rdquo;%s', 'pricom' ), '<span>', esc_html( $current_term->name ), '</span>' );
    } else {
        $results_bar_class .= ' is-tag';
        $results_bar_buttons['search_taxonomy']['title'] = sprintf( __( 'Products tagged %s&ldquo;%s&rdquo;%s', 'pricom' ), '<span>', esc_html( $current_term->name ), '</span>' );
    }
}

if ( ! empty( $results_bar_buttons ) ) :
?>

<div class="haru-shop-results-bar <?php echo esc_attr( $results_bar_class ); ?>">
    <?php 
        $shop_url = esc_url( get_permalink( wc_get_page_id( 'shop' ) ) );
        
        foreach ( $results_bar_buttons as $button ) {
            printf( '<a href="%s" id="%s" data-shop-url="%s"><i class="fa fa-times"></i>%s</a>',
                '#', // TODO: can have option
                $button['id'],
                $shop_url,
                $button['title']
            );
        }
    ?>
</div>

<?php endif; ?>