<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright (c) 2020, HaruTheme
*/

$haru_layout = get_post_meta( get_the_ID(), 'haru_layout', true );
if ( ( $haru_layout == '' ) || ( $haru_layout == 'default' ) ) {
    $haru_layout = haru_get_option( 'haru_page_layout', 'haru-container' );
}

$haru_sidebar = get_post_meta( get_the_ID(), 'haru_sidebar', true );
if ( ( $haru_sidebar == '' ) || ( $haru_sidebar == 'default' ) ) {
    $haru_sidebar = haru_get_option( 'haru_page_sidebar', 'none' );
}

$haru_left_sidebar = get_post_meta( get_the_ID(), 'haru_left_sidebar', true );
if ( ( $haru_left_sidebar == '' ) || ( $haru_left_sidebar == '-1' ) ) {
    $haru_left_sidebar = haru_get_option( 'haru_page_left_sidebar', 'sidebar-1' );
}

$haru_right_sidebar = get_post_meta( get_the_ID(), 'haru_right_sidebar', true );
if ( ( $haru_right_sidebar == '' ) || ( $haru_right_sidebar == '-1' ) ) {
    $haru_right_sidebar = haru_get_option( 'haru_page_right_sidebar', 'sidebar-2' );
}

?>
<?php
    /**
     * @hooked - haru_page_heading - 5
     **/
    do_action( 'haru_before_page' );
?>
<main class="haru-page <?php echo esc_attr( $haru_layout ); ?>">
    <div class="h-row">

        <!-- Content -->
        <div class="page-content <?php if ( is_active_sidebar( $haru_left_sidebar ) && in_array( $haru_sidebar, array( 'left', 'two' ) ) ) echo esc_attr( 'has-left-sidebar' ); ?> <?php if ( is_active_sidebar( $haru_right_sidebar ) && in_array( $haru_sidebar, array( 'right', 'two' ) ) ) echo esc_attr( 'has-right-sidebar' ); ?>">

            <div class="page-content-wrap">
                <?php
                    // Start the Loop.
                    while ( have_posts() ) : the_post();
                        // Include the page content template.
                        get_template_part( 'templates/page/content', 'page' );

                        // If comments are open or we have at least one comment, load up the comment template.
                        if ( comments_open() || get_comments_number() ) {
                            comments_template();
                        }
                    endwhile;
                ?>
            </div>
        </div>

        <!-- Sidebar -->
        <?php if ( is_active_sidebar( $haru_left_sidebar ) && in_array( $haru_sidebar, array( 'left', 'two' ) ) ) : ?>
            <div class="page-sidebar left-sidebar">
                <?php dynamic_sidebar( $haru_left_sidebar ); ?>
            </div>
        <?php endif; ?>
        <?php if ( is_active_sidebar( $haru_right_sidebar ) && in_array( $haru_sidebar, array( 'right', 'two' ) ) ) : ?>
            <div class="page-sidebar right-sidebar">
                <?php dynamic_sidebar( $haru_right_sidebar );?>
            </div>
        <?php endif; ?>

    </div>
</main>