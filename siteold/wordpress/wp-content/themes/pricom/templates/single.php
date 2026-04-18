<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

// Process Single options
$single_layout = get_post_meta( get_the_ID(), 'haru_layout', true );
if ( ( $single_layout == '' ) || ( $single_layout == 'default' ) ) {
    $single_layout = haru_get_option( 'haru_single_layout', 'haru-container' );
}

$single_sidebar = get_post_meta( get_the_ID(), 'haru_sidebar', true );
if ( ( $single_sidebar == '' ) || ( $single_sidebar == 'default' ) ) {
    $single_sidebar = haru_get_option( 'haru_single_sidebar', 'left' );
}

$single_left_sidebar = get_post_meta( get_the_ID(), 'haru_left_sidebar', true );
if ( ( $single_left_sidebar == '' ) || ( $single_left_sidebar == 'default' ) ) {
    $single_left_sidebar  = haru_get_option( 'haru_single_left_sidebar', 'sidebar-1' );
}

$single_right_sidebar = get_post_meta( get_the_ID(), 'haru_right_sidebar', true );
if ( ( $single_right_sidebar == '' ) || ( $single_right_sidebar == 'default' ) ) {
    $single_right_sidebar = haru_get_option( 'haru_single_right_sidebar', 'sidebar-1' );
}

?>
<?php
    /**
     * @hooked - haru_page_heading - 5
     **/
    do_action('haru_before_page');
?>
<div class="haru-single-blog <?php echo esc_attr( $single_layout ); ?>">
    <div class="h-row">

        <!-- Content -->
        <div class="single-content <?php if ( is_active_sidebar( $single_left_sidebar ) && in_array( $single_sidebar, array( 'left', 'two' ) ) ) echo esc_attr( 'has-left-sidebar' ); ?> <?php if ( is_active_sidebar( $single_right_sidebar ) && in_array( $single_sidebar, array( 'right', 'two' ) ) ) echo esc_attr( 'has-right-sidebar' ); ?>">
            <div class="single-wrapper">
                <?php
                    if ( have_posts() ):
                        // Start the Loop.
                        while ( have_posts() ) : the_post();
                            /*
                             * Include the post format-specific template for the content. If you want to
                             * use this in a child theme, then include a file called called content-___.php
                             * (where ___ is the post format) and that will be used instead.
                             */
                            get_template_part( 'templates/single/content' , get_post_format() );
                        endwhile;
                    else :
                        // If no content, include the "No posts found" template.
                        get_template_part( 'templates/archive/content-none');
                    endif;
                ?>
                <?php comments_template(); ?>
            </div>
        </div>
        
        <!-- Sidebar -->
        <?php if ( is_active_sidebar( $single_left_sidebar ) && in_array( $single_sidebar, array( 'left', 'two' ) ) ) : ?>
            <div class="single-sidebar left-sidebar">
                <?php dynamic_sidebar( $single_left_sidebar ); ?>
            </div>
        <?php endif; ?>
        <?php if ( is_active_sidebar( $single_right_sidebar ) && in_array( $single_sidebar, array( 'right', 'two' ) ) ) : ?>
            <div class="single-sidebar right-sidebar">
                <?php dynamic_sidebar( $single_right_sidebar );?>
            </div>
        <?php endif; ?>

    </div>
</div>