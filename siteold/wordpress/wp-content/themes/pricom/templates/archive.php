<?php 
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

// Process Archive options
$archive_layout = get_post_meta( get_the_ID(), 'haru_layout', true );
if ( ( $archive_layout == '' ) || ( $archive_layout == 'default' ) ) {
    $archive_layout = haru_get_option( 'haru_archive_layout', 'haru-container' );
}

$archive_sidebar = get_post_meta( get_the_ID(), 'haru_sidebar', true );
if ( ( $archive_sidebar == '' ) || ( $archive_sidebar == 'default' ) ) {
    $archive_sidebar = haru_get_option( 'haru_archive_sidebar', 'left' );
}

$archive_left_sidebar = get_post_meta( get_the_ID(), 'haru_left_sidebar', true );
if ( ( $archive_left_sidebar == '' ) || ( $archive_left_sidebar == 'default' ) ) {
    $archive_left_sidebar = haru_get_option( 'haru_archive_left_sidebar', 'sidebar-1' );
}

$archive_right_sidebar = get_post_meta( get_the_ID(), 'haru_right_sidebar', true );
if ( ( $archive_right_sidebar == '' ) || ( $archive_right_sidebar == 'default' ) ) {
    $archive_right_sidebar = haru_get_option( 'haru_archive_right_sidebar', 'sidebar-1' );
}

$archive_display_type = haru_get_option( 'haru_archive_display_type', 'large-image' );
$archive_columns = haru_get_option( 'haru_archive_display_columns', '3' );
$archive_paging_style = haru_get_option( 'haru_archive_paging_style', 'default' );

// Use for Demo
if ( isset( $_GET['blog_style'] ) ) {
    $archive_display_type = wc_clean( $_GET['blog_style'] ); // large-image, medium-image, grid
}

if ( isset( $_GET['blog_columns'] ) ) {
    $archive_columns = wc_clean( $_GET['blog_columns'] ); // 2, 3, 4, 5, 6
}

if ( isset( $_GET['blog_paging'] ) ) {
    $archive_paging_style = wc_clean( $_GET['blog_paging'] ); // default, load-more
}

if ( isset( $_GET['blog_sidebar'] ) ) {
    $archive_sidebar = wc_clean( $_GET['blog_sidebar'] ); // none, left, right, two
}

// Only use for Grid layout
if ( in_array( $archive_display_type, array( 'grid' ) ) ) {
    // Use layout-wrap if use Isotope
    $layout_classes[] = 'grid-columns';
    $layout_classes[] = 'grid-columns-' . esc_attr( $archive_columns );
} else {
    $layout_classes[] = '';
}

?>
<?php
    /**
     * @hooked - haru_page_heading - 5
     **/
    do_action( 'haru_before_page' );
?>
<div class="haru-archive-blog <?php echo esc_attr( $archive_layout ); ?>">
    <div class="h-row">
        <!-- Content -->
        <div class="archive-content <?php if ( is_active_sidebar( $archive_left_sidebar ) && in_array( $archive_sidebar, array( 'left', 'two' ) ) ) echo esc_attr( 'has-left-sidebar' ); ?> <?php if ( is_active_sidebar( $archive_right_sidebar ) && in_array( $archive_sidebar, array( 'right', 'two' ) ) ) echo esc_attr( 'has-right-sidebar' ); ?>">
            
            <div class="archive-content-layout layout-<?php echo esc_attr( $archive_display_type ); ?> <?php echo esc_attr( join( ' ', $layout_classes ) ); ?>">

                    <?php
                        if ( have_posts() ) :
                            // Start the Loop.
                            while ( have_posts() ) : the_post();
                                /*
                                 * Include the post format-specific template for the content. If you want to
                                 * use this in a child theme, then include a file called called content-___.php
                                 * (where ___ is the post format) and that will be used instead.
                                 */
                                get_template_part( 'templates/archive/content' , get_post_format() );
                            endwhile;
                        else :
                            // If no content, include the "No posts found" template.
                            get_template_part( 'templates/archive/content-none');
                        endif;
                    ?>
            </div>

            <?php
                global $wp_query;
                if ( $wp_query->max_num_pages > 1 ) :
            ?>
                <div class="archive-pagination <?php echo esc_attr( $archive_paging_style ); ?>">
                    <?php
                        switch( $archive_paging_style ) {
                            case 'load-more':
                                haru_paging_load_more();

                                break;

                            case 'infinity-scroll':
                                haru_paging_infinitescroll();
                                
                                break;

                            default:
                                haru_paging_nav();
                                break;
                        }
                    ?>
                </div>
            <?php endif; ?>
        </div>

        <!-- Sidebar -->
        <?php if ( is_active_sidebar( $archive_left_sidebar ) && in_array( $archive_sidebar, array( 'left', 'two' ) ) ) : ?>
            <div class="archive-sidebar left-sidebar">
                <?php dynamic_sidebar( $archive_left_sidebar ); ?>
            </div>
        <?php endif; ?>
        <?php if ( is_active_sidebar( $archive_right_sidebar ) && in_array( $archive_sidebar, array( 'right', 'two' ) ) ) : ?>
            <div class="archive-sidebar right-sidebar">
                <?php dynamic_sidebar( $archive_right_sidebar );?>
            </div>
        <?php endif; ?>
    </div>
</div>