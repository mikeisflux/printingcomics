<?php
/**
 * @package    HaruTheme
 * @version    1.0.0
 * @author     Administrator <admin@harutheme.com>
 * @copyright  Copyright 2022, HaruTheme
*/

$social_sharing    = haru_get_option( 'haru_social_sharing', array() );
$sharing_facebook  = isset( $social_sharing['facebook'] ) ? $social_sharing['facebook'] : 0;
$sharing_twitter   = isset( $social_sharing['twitter'] ) ? $social_sharing['twitter'] : 0;
$sharing_linkedin  = isset( $social_sharing['linkedin'] ) ? $social_sharing['linkedin'] : 0;
$sharing_tumblr    = isset( $social_sharing['tumblr'] ) ? $social_sharing['tumblr'] : 0;
$sharing_pinterest = isset( $social_sharing['pinterest'] ) ? $social_sharing['pinterest'] : 0;
$sharing_vk        = isset( $social_sharing['vk'] ) ? $social_sharing['vk'] : 0;
$sharing_telegram  = isset( $social_sharing['telegram'] ) ? $social_sharing['telegram'] : 0;
$sharing_whatsapp  = isset( $social_sharing['whatsapp'] ) ? $social_sharing['whatsapp'] : 0;
$sharing_email     = isset( $social_sharing['email'] ) ? $social_sharing['email'] : 0;

?>
<?php if ( $social_sharing ) : ?>
    <div class="haru-social-share">
        <?php if ( ( $sharing_facebook == 1 ) || ( $sharing_twitter == 1 ) || ( $sharing_linkedin == 1 ) || ( $sharing_tumblr == 1 ) || ( $sharing_vk == 1 ) || ( $sharing_pinterest == 1 ) || ( $sharing_telegram == 1 ) ) : ?>
            <div class="haru-social-share__wrap">
                <label class="haru-social-share__label"><?php echo esc_html__( 'Share: ', 'pricom' ); ?></label>
                <ul class="haru-social-share__list">
                    
                    <?php if ( $sharing_facebook == 1 ) : ?>
                        <li class="haru-social-share__facebook">
                            <a onclick="window.open('https://www.facebook.com/sharer.php?u=<?php echo esc_attr( urlencode(get_permalink()) ); ?>', 'sharer', 'toolbar=0,status=0,width=620,height=280');"  href="javascript:;">
                            </a>
                        </li>
                    <?php endif; ?>

                    <?php if ( $sharing_twitter == 1 ) :  ?>
                        <li class="haru-social-share__twitter">
                            <a onclick="popUp=window.open('http://twitter.com/share?text=<?php echo esc_attr(urlencode(get_the_title())); ?>&amp;url=<?php echo esc_attr(urlencode(get_permalink())); ?>','sharer','scrollbars=yes,width=800,height=400');popUp.focus();return false;"  href="javascript:;">
                            </a>
                        </li>
                    <?php endif; ?>

                    <?php if ( $sharing_linkedin == 1 ) : ?>
                        <li class="haru-social-share__linkedin">
                            <a onclick="popUp=window.open('https://linkedin.com/shareArticle?mini=true&amp;url=<?php echo esc_attr(urlencode(get_permalink())); ?>&amp;title=<?php echo esc_attr(urlencode(get_the_title())); ?>','sharer','scrollbars=yes,width=800,height=400');popUp.focus();return false;" href="javascript:;">
                            </a>
                        </li>
                    <?php endif; ?>

                    <?php if ( $sharing_tumblr == 1 ) :  ?>
                        <li class="haru-social-share__tumblr">
                            <a onclick="popUp=window.open('https://www.tumblr.com/share/link?url=<?php echo esc_attr(urlencode(get_permalink())); ?>&amp;name=<?php echo esc_attr(urlencode(get_the_title())); ?>&amp;description=<?php echo esc_attr(urlencode(get_the_excerpt())); ?>','sharer','scrollbars=yes,width=800,height=400');popUp.focus();return false;" href="javascript:;">
                            </a>
                        </li>

                    <?php endif; ?>

                    <?php if ( $sharing_pinterest == 1 ) :  ?>
                        <li class="haru-social-share__pinterest">
                            <a onclick="popUp=window.open('https://pinterest.com/pin/create/button/?url=<?php echo esc_attr(urlencode(get_permalink())); ?>&amp;description=<?php echo esc_attr(urlencode(get_the_title())); ?>&amp;media=<?php echo has_post_thumbnail() ? esc_url( get_the_post_thumbnail_url() )  : "" ; ?>','sharer','scrollbars=yes,width=800,height=400');popUp.focus();return false;" href="javascript:;">
                            </a>
                        </li>
                    <?php endif; ?>

                    <?php if ( $sharing_vk == 1 ) : ?>
                        <li class="haru-social-share__vk">
                            <a onclick="popUp=window.open('http://vk.com/share.php?url=<?php echo esc_attr(urlencode(get_permalink())); ?>&amp;description=<?php echo esc_attr(urlencode(get_the_title())); ?>&amp;image=<?php echo has_post_thumbnail() ? esc_url( get_the_post_thumbnail_url() )  : "" ; ?>','sharer','scrollbars=yes,toolbar=0,status=0,width=800,height=400');popUp.focus();return false;" href="javascript:;">
                            </a>
                        </li>
                    <?php endif; ?>

                    <?php if ( $sharing_telegram == 1 ) : ?>
                        <li class="haru-social-share__telegram">
                            <a onclick="popUp=window.open('https://telegram.me/share/url?url=<?php echo esc_attr(urlencode(get_permalink())); ?>&amp;text=<?php echo esc_attr(urlencode(get_the_title())); ?>','sharer','scrollbars=yes,toolbar=0,status=0,width=800,height=400');popUp.focus();return false;" href="javascript:;">
                            </a>
                        </li>
                    <?php endif; ?>

                    <?php if ( $sharing_whatsapp == 1 ) : ?>
                    <li class="haru-social-share__whatsapp">
                        <a onclick="popUp=window.open('https://api.whatsapp.com/send?text=<?php echo esc_attr(urlencode(get_the_title())); ?>%20<?php echo esc_attr(urlencode(get_permalink())); ?>','sharer','scrollbars=yes,toolbar=0,status=0,width=800,height=400');popUp.focus();return false;" href="javascript:;">
                        </a>
                    </li>
                    <?php endif; ?>

                    <?php if ( $sharing_email == 1 ) : ?>
                    <li class="haru-social-share__email">
                        <a href="mailto:?subject=<?php echo esc_attr(urlencode(get_the_title())); ?>&amp;body=<?php echo esc_attr(urlencode(get_permalink())); ?> <?php echo esc_attr(urlencode(get_the_title())); ?>">
                        </a>
                    </li>
                    <?php endif; ?>
                </ul>
            </div>
        <?php endif; ?>
    </div>
<?php endif; ?>
