<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

// Don't print empty markup if there's nowhere to navigate.
$prev_post = get_previous_post();
$next_post = get_next_post();

if ( ! $prev_post && ! $next_post ) {
  return;
}

$show_post_navigation = haru_get_option( 'haru_show_post_navigation', '1' );
if ( $show_post_navigation == '0' ) {
  return;
}

?>
<div class="single-post-navigation clearfix">
	<div class="post-nav">
		<?php if ( $prev_post ) : ?>
			<div class="post-prev">
	        <a href="<?php echo esc_url( get_permalink( $prev_post->ID ) ); ?>" class="post-nav-link"></a>
	        <div class="post-nav-content">
	            <div class="post-nav-meta">
	                <div class="post-nav-label"><?php echo esc_html__( 'Previous', 'pricom' ); ?></div>
	                <h6 class="post-nav-title"><?php echo get_the_title( $prev_post->ID ); ?></h6>
	            </div>
	        </div>
	    </div>
	    <?php endif; ?>

	    <?php if ( $next_post ) : ?>
	    <div class="post-next">
	        <a href="<?php echo esc_url( get_permalink( $next_post->ID ) ); ?>" class="post-nav-link"></a>
	        <div class="post-nav-content">
	            <div class="post-nav-meta">
	                <div class="post-nav-label"><?php echo esc_html__( 'Next', 'pricom' ); ?></div>
	                <h6 class="post-nav-title"><?php echo get_the_title( $next_post->ID ); ?></h6>
	            </div>  
	        </div>
	    </div>
	    <?php endif; ?>
    </div>
</div><!-- .navigation -->