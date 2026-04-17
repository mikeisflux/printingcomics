<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

$show_author_info = haru_get_option('haru_show_author_info');
if ( $show_author_info == '0' ) {
    return;
}
$author_description = get_the_author_meta('description');

?>
<div class="author-info">
    <div class="author-avatar">
        <?php
            echo get_avatar( get_the_author_meta( 'user_email' ) );
        ?>
    </div>
    <div class="author-description">
        <h5 class="author-title"><?php the_author_posts_link(); ?></h5>
        <p class="author-bio"><?php the_author_meta( 'description' ); ?></p>
        <a href="<?php the_author_meta( 'url' ); ?>" class="author-url"><?php echo esc_html__( 'Website', 'pricom' ); ?></a>
    </div>
</div>